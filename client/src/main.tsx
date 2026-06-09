import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { queryClient } from './lib/queryClient';
import { initOfflineQueue } from './lib/offlineQueue';
import { RunProvider } from './features/run/RunContext';
import { App } from './App';
import './index.css';

initOfflineQueue(queryClient);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <RunProvider>
        <App />
      </RunProvider>
    </BrowserRouter>
  </QueryClientProvider>,
);
