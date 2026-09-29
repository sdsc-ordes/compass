export type Filters = Record<string, string | string[] | undefined>;

export type FilterOption = { value: string; label: string; description?: string };

export type FilterWidget = {
  id: string;
  path: string;
  label: string;
  description?: string;
  type: 'multiselect' | 'slider' | 'datepicker' | 'toggle';
  order: number;
  options?: FilterOption[];
  min?: number | string;
  max?: number | string;
};
