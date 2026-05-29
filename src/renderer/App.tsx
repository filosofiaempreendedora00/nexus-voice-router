import { useEffect, useState } from 'react'
import { Sidebar, type Page } from './components/Sidebar'
import { Home } from './pages/Home'
import { Chat } from './pages/Chat'
import { Usage } from './pages/Usage'
import { Mobile } from './pages/Mobile'
import { Agents } from './pages/Agents'
import { Routes } from './pages/Routes'
import { History } from './pages/History'
import { Settings } from './pages/Settings'
import { ToastProvider } from './components/Toast'
import { api } from './lib/api'

export default function App(): JSX.Element {
  const [page, setPage] = useState<Page>('home')
  const [hotkey, setHotkey] = useState('CommandOrControl+Shift+Space')

  useEffect(() => {
    void api.getSettings().then((s) => setHotkey(s.hotkey))
  }, [page])

  return (
    <ToastProvider>
      <div className="flex h-screen bg-bg">
        <Sidebar current={page} onNavigate={setPage} hotkey={hotkey} />
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="titlebar flex-shrink-0" />
          <div className="flex-1 overflow-hidden">
            {page === 'home' && <Home onNavigateToRoutes={() => setPage('routes')} />}
            {page === 'chat' && <Chat />}
            {page === 'mobile' && <Mobile />}
            {page === 'usage' && <Usage />}
            {page === 'agents' && <Agents />}
            {page === 'routes' && <Routes />}
            {page === 'history' && <History />}
            {page === 'settings' && <Settings />}
          </div>
        </main>
      </div>
    </ToastProvider>
  )
}
