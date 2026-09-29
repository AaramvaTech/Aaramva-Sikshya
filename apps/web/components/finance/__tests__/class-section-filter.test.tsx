// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ClassSectionFilter } from '../class-section-filter';
import type { ClassWithSections } from '@/types/api.types';

afterEach(() => cleanup());

const classes: ClassWithSections[] = [
  { id: 'c6', name: 'Grade 6', alias: null, orderIndex: 6, sections: [{ id: 's6a', name: 'A', capacity: 40 }] },
  { id: 'c9', name: 'Grade 9', alias: null, orderIndex: 9, sections: [
    { id: 's9a', name: 'A', capacity: 40 }, { id: 's9b', name: 'B', capacity: 40 },
  ] },
];
const optionNames = (label: string) =>
  Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map((o) => o.text);

describe('ClassSectionFilter', () => {
  it('disables Section until a class is chosen', () => {
    render(<ClassSectionFilter classes={classes} classId="" sectionId="" onChange={() => {}} />);
    expect((screen.getByLabelText('Section') as HTMLSelectElement).disabled).toBe(true);
  });

  it("lists only the chosen class's sections", () => {
    render(<ClassSectionFilter classes={classes} classId="c9" sectionId="" onChange={() => {}} />);
    expect(optionNames('Section')).toEqual(['All Sections', 'A', 'B']);
  });

  it('picking a class clears the section', () => {
    const onChange = vi.fn();
    render(<ClassSectionFilter classes={classes} classId="c9" sectionId="s9b" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Class'), { target: { value: 'c6' } });
    expect(onChange).toHaveBeenCalledWith({ classId: 'c6', sectionId: '' });
  });

  it('picking a section keeps the class', () => {
    const onChange = vi.fn();
    render(<ClassSectionFilter classes={classes} classId="c9" sectionId="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 's9b' } });
    expect(onChange).toHaveBeenCalledWith({ classId: 'c9', sectionId: 's9b' });
  });

  it('a single-class run shows only Section, listing that class sections', () => {
    render(<ClassSectionFilter classes={classes} classId="" sectionId="" fixedClassId="c9" onChange={() => {}} />);
    expect(screen.queryByLabelText('Class')).toBeNull();
    expect((screen.getByLabelText('Section') as HTMLSelectElement).disabled).toBe(false);
    expect(optionNames('Section')).toEqual(['All Sections', 'A', 'B']);
  });
});
