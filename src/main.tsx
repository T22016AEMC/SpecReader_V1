import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {initializeRDKit} from './engines/scientificEngines/rdkitAdapter';

await initializeRDKit();
createRoot(document.getElementById('root')!).render(<App />);
