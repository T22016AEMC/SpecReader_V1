import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {initializeRDKit} from './engines/scientificEngines/rdkitAdapter';
import {applyExperiments, parseExperimentParam} from './engines/constraints/experimentFlags';

// v1.4.1 stop 20: ?exp=h1,ir switches the new v1.4.0 / v1.4.1 rule sets on for this page load only (nothing is stored; no parameter = the default). The worker is told by analysisSession.
applyExperiments(parseExperimentParam(window.location.search));
await initializeRDKit();
createRoot(document.getElementById('root')!).render(<App />);
