// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OverviewPage } from './OverviewPage';
import { tagGroups } from '../../../shared/tag-catalog.js';
import { readClassQuery } from '../../../shared/class-query.js';
import type { CatalogOverview } from '../classes/types';

const { apiRequest, getOverview, getTagGroups } = vi.hoisted(() => ({
  apiRequest: vi.fn(), getOverview: vi.fn(), getTagGroups: vi.fn(),
}));

vi.mock('../../app/api', async importOriginal => ({ ...(await importOriginal<typeof import('../../app/api')>()), apiRequest }));
vi.mock('../classes/api', () => ({ getOverview }));
vi.mock('../tags/api', () => ({ getTagGroups, createCustomTag: vi.fn() }));

const groups = tagGroups.map(group => ({
  id: group.id, label: group.label, structural: group.structural === true, custom: group.custom === true,
  tags: group.tags.map(value => ({ value, label: value })), version: `version-${group.id}`,
}));

function dashboardData(): CatalogOverview {
  return {
    head: { revision: 4, updatedAt: '2026-11-23T00:00:00.000Z' },
    counts: { classes: 5, cards: 12, skills: 2, keywords: 3, confirmed: 1 },
    lineages: [{ id: 'base_0', name: 'Fighter', tier: 'C1' as const, slot: 'C1_0', icon: '/thumbs/base_0.webp', position: 0 }],
    galleryNames: {},
    dashboard: {
      query: { logic: 'AND' as const, source: 'effective' as const, rules: [] }, search: 'fire', total: 3,
      counts: { classes: 3, c3: 1, skills: 2, specializations: 1 },
      tierCounts: { C1: 1, C2: 0, C3: 1, SPEC: 1 },
      tagCoverage: [{ tag: 'Fire', classes: 2 }],
      classes: [{ id: 'rune', name: 'Rune Adept', tier: 'C3' as const, slot: 'C1_0/C2_0/C3_0', parentId: null, concept: 'Fire', position: 1, effectiveTagCount: 3 }],
      resultsTruncated: false,
    },
  };
}

function renderOverview(initialEntry = '/?view=overview&q=fire') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<MemoryRouter initialEntries={[initialEntry]}><QueryClientProvider client={client}><OverviewPage /></QueryClientProvider></MemoryRouter>);
  return { ...view, client };
}

beforeEach(() => {
  getOverview.mockImplementation((_signal: AbortSignal, params?: URLSearchParams) => {
    const data = dashboardData();
    data.dashboard.query = readClassQuery(params ?? new URLSearchParams());
    return Promise.resolve(data);
  });
  getTagGroups.mockResolvedValue({ groups });
  apiRequest.mockResolvedValue({ items: [] });
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Dashboard query and metric navigation', () => {
  it('labels filtered metrics with distinct-ID units and links tag coverage to the same class query domain', async () => {
    const { client } = renderOverview();
    await screen.findByRole('heading', { name: 'Matching classes 3' });
    expect(screen.getByText('distinct skill IDs, including inherited')).toBeTruthy();

    const tagLink = await screen.findByRole('link', { name: 'Filter classes with effective tag Fire (2)' });
    const tagUrl = new URL(tagLink.getAttribute('href')!, 'https://loknite.test');
    expect(tagUrl.searchParams.get('view')).toBe('database');
    expect(tagUrl.searchParams.get('type')).toBe('classes');
    expect(tagUrl.searchParams.get('q')).toBe('fire');
    const tagQuery = JSON.parse(tagUrl.searchParams.get('where') ?? 'null');
    expect(tagQuery.logic).toBe('AND');
    expect(tagQuery.source).toBe('effective');
    expect(tagQuery.rules).toEqual([{ field: 'tag', value: 'Fire', enabled: true, exclude: false }]);
    client.clear();
  });

  it('opens a tier count in Database while preserving the original OR query as a scope', async () => {
    const originalQuery = { logic: 'OR', source: 'direct', rules: [{ field: 'tier', value: 'C2' }] };
    const { client } = renderOverview('/?view=overview&where=' + encodeURIComponent(JSON.stringify(originalQuery)));
    await screen.findByRole('heading', { name: 'Matching classes 3' });
    const tierLink = screen.getByRole('link', { name: 'Filter classes by C3 (1)' });
    const url = new URL(tierLink.getAttribute('href')!, 'https://loknite.test');
    const drilldown = JSON.parse(url.searchParams.get('where') ?? 'null');
    expect(drilldown.logic).toBe('AND');
    expect(drilldown.rules).toEqual([{ field: 'tier', value: 'C3', enabled: true, exclude: false }]);
    expect(drilldown.scope).toEqual({ logic: 'OR', source: 'direct', rules: [{ field: 'tier', value: 'C2', enabled: true, exclude: false }] });
    client.clear();
  });

  it('sends the Dashboard URL search and shared query to the aggregate API', async () => {
    const user = userEvent.setup();
    const { client } = renderOverview('/?view=overview&q=fire&where=' + encodeURIComponent(JSON.stringify({ logic: 'OR', source: 'direct', rules: [{ field: 'tier', value: 'C2' }] })));
    await screen.findByRole('heading', { name: 'Matching classes 3' });
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      const filters = getOverview.mock.calls.at(-1)?.[1] as URLSearchParams | undefined;
      expect(filters?.get('q')).toBe('fire');
      const query = JSON.parse(filters?.get('where') ?? 'null');
      expect(query.logic).toBe('OR');
      expect(query.source).toBe('direct');
      expect(query.rules).toEqual([{ field: 'tier', value: 'C2' }]);
    });
    client.clear();
  });
});
