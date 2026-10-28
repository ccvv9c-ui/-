import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {registerServiceWorkerSafely} from './utils/pwaRegister.ts';

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    void registerServiceWorkerSafely();
  });
}

createRoot(document.getElementById('root')!).render(<App />);

