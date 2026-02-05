/**
 * GeminiHydra GUI - Main Application
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './contexts/ThemeContext';
import { Layout } from './components/layout';
import { ChatView, AgentsView, HistoryView, SettingsView } from './views';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Layout>
          {(view) => {
            switch (view) {
              case 'chat':
                return <ChatView />;
              case 'agents':
                return <AgentsView />;
              case 'history':
                return <HistoryView />;
              case 'settings':
                return <SettingsView />;
              default:
                return <ChatView />;
            }
          }}
        </Layout>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
