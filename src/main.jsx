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
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import constants from './constants.json';
import ScreenshotsView from './components/ScreenshotsView.jsx';
import ExportsView from './components/ExportsView.jsx';
import MetadataView from './components/MetadataView.jsx';
import IconsView from './components/IconsView.jsx';
import PrecheckView from './components/PrecheckView.jsx';
import KeywordsView from './components/KeywordsView.jsx';
import AnalyticsView from './components/AnalyticsView.jsx';
import SettingsView from './components/SettingsView.jsx';
import LandingView from './components/LandingView.jsx';
import { AppProvider } from './components/AppContext.jsx';
import AnalyticsProvider from './components/AnalyticsProvider.jsx';

/**
 * Composed wrapper: analytics tracking wraps app-specific context.
 * @param {Object} props
 * @param {React.ReactNode} props.children
 */
const AppWrapper = ({ children }) => (
  <AnalyticsProvider><AppProvider>{children}</AppProvider></AnalyticsProvider>
);

/**
 * Application route configuration
 *
 * @type {Array<{path: string, element: JSX.Element}>}
 */
const appRoutes = [
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
    settings: SettingsView
  }
});
