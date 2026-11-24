import { lightTheme } from '@kinvolk/headlamp-plugin/lib/components/App/defaultAppThemes';
import { createMuiTheme } from '@kinvolk/headlamp-plugin/lib/lib/themes';
import { ThemeProvider } from '@mui/material/styles';
import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import React from 'react';
import { I18nextProvider, useTranslation as useReactTranslation } from 'react-i18next';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ReleaseList from './List';

vi.mock('@kinvolk/headlamp-plugin/lib', () => ({
  useTranslation: (namespace: string) => useReactTranslation(namespace),
}));

vi.mock('../../api/charts', () => ({
  fetchLatestAppVersion: vi.fn().mockResolvedValue('2.0.0'),
}));

vi.mock('../../api/releases', () => ({
  listReleases: vi.fn(),
  deleteRelease: vi.fn(),
  getActionStatus: vi.fn(),
  getReleaseHistory: vi.fn(),
  rollbackRelease: vi.fn(),
  fetchChart: vi.fn(),
  upgradeRelease: vi.fn(),
}));

const releases = [
  { name: 'nginx-dev', namespace: 'default', version: 10 },
  { name: 'nginx-prod', namespace: 'production', version: 2 },
  { name: 'redis-prod', namespace: 'production', version: 1 },
].map(release => ({
  ...release,
  chart: { metadata: { name: 'example-chart', version: '3.0.0', appVersion: '1.0.0' } },
  info: { status: 'deployed', last_deployed: '2026-01-01T12:00:00Z' },
}));

async function renderList(language = 'en') {
  const i18n = createInstance();
  await i18n.init({
    lng: language,
    fallbackLng: 'en',
    defaultNS: 'app-catalog',
    resources: {
      en: { 'app-catalog': {} },
      de: { 'app-catalog': { Search: 'Suchen', Namespace: 'Namensraum', Revision: 'Revision' } },
    },
  });
  const store = configureStore({
    reducer: () => ({
      config: { settings: { tableRowsPerPageOptions: [15, 25, 50] } },
      drawerMode: { isDetailDrawerEnabled: false },
    }),
  });

  render(
    <I18nextProvider i18n={i18n}>
      <Provider store={store}>
        <ThemeProvider theme={createMuiTheme(lightTheme)}>
          <MemoryRouter>
            <ReleaseList fetchReleases={() => Promise.resolve({ releases })} />
          </MemoryRouter>
        </ThemeProvider>
      </Provider>
    </I18nextProvider>
  );
  await screen.findByRole('link', { name: 'nginx-dev' });
}

function releaseNames() {
  return within(screen.getByRole('table'))
    .getAllByRole('link')
    .map(link => link.textContent);
}

describe('ReleaseList', () => {
  it('shows Helm revisions separately from app versions and sorts them numerically', async () => {
    await renderList();

    const header = screen.getByRole('columnheader', { name: /Revision/ });
    const row = screen.getByRole('row', { name: /nginx-dev/ });
    expect(within(row).getByRole('cell', { name: '10' })).toBeDefined();
    expect(within(row).getByRole('cell', { name: '1.0.0' })).toBeDefined();

    fireEvent.click(within(header).getByRole('button', { name: /Sort ascending/ }));
    await waitFor(() => expect(releaseNames()).toEqual(['redis-prod', 'nginx-prod', 'nginx-dev']));

    fireEvent.click(within(header).getByRole('button', { name: /Sort descending/ }));
    await waitFor(() => expect(releaseNames()).toEqual(['nginx-dev', 'nginx-prod', 'redis-prod']));
  });

  it('combines case-insensitive name search with the namespace filter and clears both', async () => {
    await renderList();

    const search = screen.getByRole('textbox', { name: 'Search' });
    fireEvent.change(search, { target: { value: 'NGINX' } });
    await waitFor(() => expect(releaseNames()).toEqual(['nginx-dev', 'nginx-prod']));

    const namespace = screen.getByRole('combobox', { name: 'Namespace' });
    fireEvent.change(namespace, { target: { value: 'production' } });
    fireEvent.click(await screen.findByRole('option', { name: 'production' }));
    await waitFor(() => expect(releaseNames()).toEqual(['nginx-prod']));

    fireEvent.change(search, { target: { value: 'missing' } });
    await screen.findByText('No data to be shown.');

    fireEvent.change(search, { target: { value: '' } });
    await waitFor(() => expect(releaseNames()).toEqual(['nginx-prod', 'redis-prod']));

    fireEvent.change(namespace, { target: { value: '' } });
    await waitFor(() => expect(releaseNames()).toEqual(['nginx-dev', 'nginx-prod', 'redis-prod']));
  });

  it('uses plugin translations for the filter labels', async () => {
    await renderList('de');

    expect(screen.getByRole('textbox', { name: 'Suchen' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Namensraum' })).toBeDefined();
  });
});
