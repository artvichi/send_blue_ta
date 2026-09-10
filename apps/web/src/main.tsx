import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { applyStoredTheme } from './hooks/use-theme';
import './styles.css';

// Before render, so the first paint is never the wrong theme.
applyStoredTheme();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
