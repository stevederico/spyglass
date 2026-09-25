/**
 * Application entry point for Spyglass - App Store toolkit
 *
 * Configures routing and initializes app with skateboard-ui framework.
 * Routes map to views for Screenshots, Metadata, Exports, Icons, Precheck,
 * Keywords, and Analytics. Settings override injects ASC credentials.
 *
 * @see {@link https://github.com/stevederico/skateboard|Skateboard Docs}
 */
import './assets/styles.css';
import type { ReactNode } from 'react';
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import type { AppRoute } from '@stevederico/skateboard-ui/App';
import Layout from '@stevederico/skateboard-ui/Layout';
import constants from './constants.json';
import CommandMenu from './components/CommandMenu';
import ScreenshotsView from './components/ScreenshotsView';
import ExportsView from './components/ExportsView';
import MetadataView from './components/MetadataView';
import IconsView from './components/IconsView';
import PrecheckView from './components/PrecheckView';
import KeywordsView from './components/KeywordsView';
import AnalyticsView from './components/AnalyticsView';
import SettingsView from './components/SettingsView';
import LandingView from './components/LandingView';
import { AppProvider } from './components/AppContext';
import AnalyticsProvider from './components/AnalyticsProvider';

/**
 * Composed wrapper: analytics tracking wraps app-specific context.
 * @param props.children - App content rendered inside the providers
 */
const AppWrapper = ({ children }: { children?: ReactNode }) => (
  <AnalyticsProvider><AppProvider>{children}</AppProvider></AnalyticsProvider>
);

/**
 * App layout with global command menu overlay.
 *
 * Wraps the default skateboard-ui Layout and injects CommandMenu
 * so the Cmd+K shortcut is available on all authenticated routes.
 *
 * @returns {JSX.Element} Layout with command menu
 */
function AppLayout() {
  return (
    <>
      <CommandMenu />
      <Layout />
    </>
  );
}

/**
 * Application route configuration
 *
 * Maps route paths to view components. Routes are relative to root (no leading slash).
 */
const appRoutes: AppRoute[] = [
  { path: 'home', element: <ScreenshotsView /> },
  { path: 'metadata', element: <MetadataView /> },
  { path: 'exports', element: <ExportsView /> },
  { path: 'icons', element: <IconsView /> },
  { path: 'precheck', element: <PrecheckView /> },
  { path: 'keywords', element: <KeywordsView /> },
  { path: 'analytics', element: <AnalyticsView /> }
];

/**
 * Initialize and mount Skateboard app
 *
 * @param {Object} config - App configuration
 * @param {Object} config.constants - App constants from constants.json
 * @param {Array} config.appRoutes - Route configuration array
 * @param {string} config.defaultRoute - Initial route path
 * @param {Object} config.overrides - Component overrides for built-in views
 */
if (!localStorage.getItem('theme')) {
  localStorage.setItem('theme', 'dark');
}

createSkateboardApp({
  constants,
  appRoutes,
  defaultRoute: 'home',
  landingPage: <LandingView />,
  wrapper: AppWrapper,
  overrides: {
    settings: SettingsView,
    layout: AppLayout
  }
});
