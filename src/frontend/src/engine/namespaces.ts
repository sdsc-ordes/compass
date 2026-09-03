/** Types shared between the widget and the API's filter schema. */

/** A filter selection: one dimension id to the values chosen under it. */
export type Filters = Record<string, string | string[] | undefined>;
