import { createRoot } from 'react-dom/client';
import { DevToolsApp } from './DevToolsApp';
import '../styles/devtools.css';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<DevToolsApp />);
}
