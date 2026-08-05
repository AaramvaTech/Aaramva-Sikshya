import { Edit2, Trash2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

export function ConfigSection({
  title,
  description,
  isLoading,
  addSlot,
  children,
}: {
  title: string;
  description: string;
  isLoading: boolean;
  addSlot: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
        <h4 className="font-semibold text-black dark:text-white">{title}</h4>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <div className="px-6 py-4 border-b border-stroke dark:border-strokedark bg-gray-50/50 dark:bg-gray-800/20">
        {addSlot}
      </div>
      <div className="px-6 py-2">
        {isLoading ? (
          <div className="space-y-3 py-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 rounded" />)}
          </div>
        ) : children}
      </div>
    </div>
  );
}

export function ConfigRow({
  isEditing,
  editValue,
  onEditChange,
  onStartEdit,
  onSave,
  onCancel,
  onDelete,
  isSaving,
  children,
}: {
  isEditing: boolean;
  editValue: string;
  onEditChange: (v: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  isSaving: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
      {isEditing ? (
        <div className="flex items-center gap-2 flex-1">
          <Input
            value={editValue}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
            className="max-w-xs h-8 text-sm"
            autoFocus
          />
          <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={onSave} disabled={isSaving}>
            <Check className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          {children}
          <div className="flex gap-1 shrink-0">
            <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400 hover:text-gray-600" onClick={onStartEdit}>
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
