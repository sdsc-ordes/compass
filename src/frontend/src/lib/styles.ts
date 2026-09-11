/**
 * The widget's stylesheet, split by scope and concatenated here.
 *
 * Injected as one plain <style> element rather than compiled by Svelte: the place
 * names and pin twins are built imperatively, and Svelte prunes CSS it cannot see
 * used, so as plain CSS nothing is pruned and no selector needs :global().
 *
 * The order below is cascade order, not alphabetical.
 *
 * Each file now carries its own `@media (max-width: 860px)` block at its end, so
 * a rule and its mobile override live together and the override outranks its base
 * by position within the one file. `dark` and `mobile` still come last: `dark`
 * redefines the --stage-* tokens for `.mapc.night`, and `mobile` holds the panel's
 * handle and backdrop, which exist nowhere else.
 */
import base from '../styles/base.css?inline';
import sidebar from '../styles/sidebar.css?inline';
import filters from '../styles/filters.css?inline';
import stage from '../styles/stage.css?inline';
import chrome from '../styles/chrome.css?inline';
import cards from '../styles/cards.css?inline';
import detail from '../styles/detail.css?inline';
import dark from '../styles/dark.css?inline';
import mobile from '../styles/mobile.css?inline';

export const styles = [base, sidebar, filters, stage, chrome, cards, detail, dark, mobile].join(
  '\n',
);
