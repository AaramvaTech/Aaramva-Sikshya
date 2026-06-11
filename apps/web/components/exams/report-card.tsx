'use client';

import Image from 'next/image';
import { Printer, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ReportCard } from '@/types/api.types';

interface ReportCardProps {
  reportCard: ReportCard;
  filterExamTypeId?: string; // if set, show only this exam type (single-term view)
}

export function ReportCardView({ reportCard, filterExamTypeId }: ReportCardProps) {
  const { student, examResults, annualResult } = reportCard;

  const sortedExams = [...examResults].sort(
    (a, b) => a.examType.orderIndex - b.examType.orderIndex,
  );

  // Single-term mode: filter to one exam type
  const displayExams = filterExamTypeId
    ? sortedExams.filter((er) => er.examType.id === filterExamTypeId)
    : sortedExams;

  const isSingleTerm = filterExamTypeId && displayExams.length === 1;
  const singleExam = isSingleTerm ? displayExams[0] : null;

  // Collect all subjects from displayed exams (union of subjects across all shown terms)
  const subjectMap = new Map<string, { subjectId: string; subjectName: string }>();
  for (const er of displayExams) {
    for (const s of er.subjects) {
      if (!subjectMap.has(s.subjectId)) {
        subjectMap.set(s.subjectId, { subjectId: s.subjectId, subjectName: s.subjectName });
      }
    }
  }
  const allSubjects = Array.from(subjectMap.values());

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: fixed; inset: 0; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="print-area">
        {/* Print button */}
        <div className="no-print flex justify-end mb-4">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>

        <div className="border rounded-xl p-6 bg-white space-y-6 max-w-5xl mx-auto">
          {/* Header */}
          <div className="border-b pb-4 flex flex-col items-center gap-2">
            <Image
              src="/logo.png"
              alt="Aaramva Shikshya"
              width={160}
              height={40}
              className="object-contain"
              priority
            />
            <h1 className="text-xl font-bold text-gray-900">
              {isSingleTerm ? `${singleExam!.examType.name} Report Card` : 'Academic Report Card'}
            </h1>
            <p className="text-sm text-gray-500">{student.academicYear}</p>
          </div>

          {/* Student info */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            {[
              { label: 'Student Name', value: student.fullName },
              { label: 'Admission No.', value: student.admissionNumber },
              { label: 'Class', value: `${student.className} - ${student.sectionName}` },
              { label: 'Roll Number', value: student.rollNumber ?? '—' },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
                <p className="font-semibold text-gray-800 mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Marks table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-2 font-medium text-gray-600 border">Subject</th>
                  {displayExams.map((er) => (
                    <th
                      key={er.examType.id}
                      className="text-center px-3 py-2 font-medium text-gray-600 border min-w-[110px]"
                    >
                      <div>{er.examType.name}</div>
                      {!isSingleTerm && (
                        <div className="text-xs text-gray-400 font-normal">
                          ({er.examType.weightPercent}%)
                        </div>
                      )}
                    </th>
                  ))}
                  {!isSingleTerm && (
                    <th className="text-center px-3 py-2 font-medium text-gray-600 border min-w-[80px]">
                      Annual
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {allSubjects.map((subj) => (
                  <tr key={subj.subjectId} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2 border font-medium text-gray-800">{subj.subjectName}</td>
                    {displayExams.map((er) => {
                      const s = er.subjects.find((x) => x.subjectId === subj.subjectId);
                      return (
                        <td key={er.examType.id} className="px-3 py-2 border text-center">
                          {s?.isAbsent ? (
                            <span className="text-error-500 text-xs font-medium">ABS</span>
                          ) : s?.marksObtained != null ? (
                            <div>
                              <span
                                className={`font-semibold ${s.isPassed ? '' : 'text-error-500'}`}
                              >
                                {s.marksObtained}
                              </span>
                              <span className="text-gray-400 text-xs">/{s.fullMarks}</span>
                              {s.grade && (
                                <span className="ml-1 text-xs text-gray-500">({s.grade})</span>
                              )}
                              {!s.isPassed && (
                                <span className="ml-1 text-xs text-error-400">✗</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      );
                    })}
                    {!isSingleTerm && (
                      <td className="px-3 py-2 border text-center text-gray-400 text-xs">—</td>
                    )}
                  </tr>
                ))}

                {/* Totals row */}
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-3 py-2 border text-gray-700">Total</td>
                  {displayExams.map((er) => (
                    <td key={er.examType.id} className="px-3 py-2 border text-center">
                      <div className="text-sm font-bold text-gray-800">
                        {er.percentage.toFixed(1)}%
                      </div>
                      <div className="text-xs text-gray-500">{er.grade}</div>
                      <div
                        className={`text-xs font-medium ${
                          er.isPassed ? 'text-success-600' : 'text-error-500'
                        }`}
                      >
                        {er.isPassed ? 'Pass' : 'Fail'}
                      </div>
                    </td>
                  ))}
                  {!isSingleTerm && (
                    <td className="px-3 py-2 border text-center">
                      <div className="text-sm font-bold text-gray-800">
                        {annualResult.weightedPercentage.toFixed(1)}%
                      </div>
                      <div className="text-xs text-gray-500">{annualResult.finalGrade}</div>
                    </td>
                  )}
                </tr>

                {/* Rank row */}
                <tr className="bg-gray-50/50">
                  <td className="px-3 py-2 border text-gray-600 text-xs">Rank (Section / Class)</td>
                  {displayExams.map((er) => (
                    <td
                      key={er.examType.id}
                      className="px-3 py-2 border text-center text-xs text-gray-600"
                    >
                      {er.rankInSection} / {er.rankInClass}
                    </td>
                  ))}
                  {!isSingleTerm && <td className="px-3 py-2 border" />}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="border rounded-lg px-4 py-4 bg-gray-50">
            {isSingleTerm ? (
              /* Single-term summary */
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                    Percentage
                  </p>
                  <p className="text-lg font-bold text-gray-800 mt-0.5">
                    {singleExam!.percentage.toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Grade</p>
                  <p className="text-lg font-bold text-brand-500 mt-0.5">
                    {singleExam!.grade ?? '—'}
                  </p>
                </div>
                {singleExam!.gpa != null && (
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">GPA</p>
                    <p className="text-lg font-bold text-gray-800 mt-0.5">
                      {singleExam!.gpa.toFixed(2)}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Rank</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">
                    {singleExam!.rankInSection} / {singleExam!.rankInClass}
                  </p>
                </div>
              </div>
            ) : (
              /* Annual summary */
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                    Weighted %
                  </p>
                  <p className="text-lg font-bold text-gray-800 mt-0.5">
                    {annualResult.weightedPercentage.toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                    Final Grade
                  </p>
                  <p className="text-lg font-bold text-brand-500 mt-0.5">{annualResult.finalGrade}</p>
                </div>
                {annualResult.finalGpa != null && (
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">GPA</p>
                    <p className="text-lg font-bold text-gray-800 mt-0.5">
                      {annualResult.finalGpa.toFixed(2)}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                    Division
                  </p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">{annualResult.division}</p>
                </div>
              </div>
            )}
            <div className="mt-3 flex items-center gap-2">
              {(isSingleTerm ? singleExam!.isPassed : annualResult.isPassed) ? (
                <>
                  <CheckCircle className="h-5 w-5 text-success-500" />
                  <span className="font-semibold text-success-700">Passed</span>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-error-500" />
                  <span className="font-semibold text-error-600">Failed</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
