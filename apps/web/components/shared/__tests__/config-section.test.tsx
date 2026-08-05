// @vitest-environment jsdom
//
// No @testing-library/jest-dom in this project (not installed) — assertions
// use plain vitest matchers against queryByText/getByText results instead of
// `.toBeInTheDocument()` (established convention, see leave-balance-summary.test.tsx).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ConfigSection, ConfigRow } from '../config-section';

afterEach(() => {
  cleanup();
});

describe('ConfigSection', () => {
  it('renders title, description, and addSlot', () => {
    render(
      <ConfigSection title="Fee Heads" description="Manage fee heads" isLoading={false} addSlot={<button>Add</button>}>
        <div>row content</div>
      </ConfigSection>,
    );
    expect(screen.getByText('Fee Heads')).toBeTruthy();
    expect(screen.getByText('Manage fee heads')).toBeTruthy();
    expect(screen.getByText('Add')).toBeTruthy();
    expect(screen.getByText('row content')).toBeTruthy();
  });

  it('shows skeletons instead of children while loading', () => {
    render(
      <ConfigSection title="X" description="Y" isLoading addSlot={null}>
        <div>row content</div>
      </ConfigSection>,
    );
    expect(screen.queryByText('row content')).toBeNull();
  });
});

describe('ConfigRow', () => {
  it('calls onStartEdit / onDelete from the display state', () => {
    const onStartEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <ConfigRow
        isEditing={false} editValue="" onEditChange={() => {}}
        onStartEdit={onStartEdit} onSave={() => {}} onCancel={() => {}} onDelete={onDelete} isSaving={false}
      >
        <span>Row Label</span>
      </ConfigRow>,
    );
    expect(screen.getByText('Row Label')).toBeTruthy();
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(onStartEdit).toHaveBeenCalledTimes(1);
    fireEvent.click(buttons[1]);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('shows the edit input and Save/Cancel controls when isEditing', () => {
    const onSave = vi.fn();
    render(
      <ConfigRow
        isEditing editValue="Current Name" onEditChange={() => {}}
        onStartEdit={() => {}} onSave={onSave} onCancel={() => {}} onDelete={() => {}} isSaving={false}
      >
        <span>unused while editing</span>
      </ConfigRow>,
    );
    expect(screen.getByDisplayValue('Current Name')).toBeTruthy();
    fireEvent.keyDown(screen.getByDisplayValue('Current Name'), { key: 'Enter' });
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
