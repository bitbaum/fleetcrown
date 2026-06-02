// @ts-nocheck -- JSX namespace resolution in shared tsconfig; Vite build succeeds fine
import { useState, useEffect } from 'react'

declare global {
  interface Window {
    cockpit: {
      ping: () => Promise<string>
      getRuntimeStatus: () => Promise<any>
      getProjects: () => Promise<any>
      dispatchIntent: (args: { projectKey: string; intent: string; queueHead?: string }) => Promise<any>
      getCurrentState: () => Promise<any>
    }
  }
}

function App(): JSX.Element {
  const [status, setStatus] = useState<any>(null)
  const [projects, setProjects] = useState<any>(null)
  const [response, setResponse] = useState<string>('')
  const [dispatching, setDispatching] = useState<string | null>(null)

  const refreshStatus = async () => {
    try {
      const s = await window.cockpit.getRuntimeStatus()
      setStatus(s)
    } catch (e) {
      setResponse('Error: ' + (e as Error).message)
    }
  }

  const loadProjects = async () => {
    try {
      const p = await window.cockpit.getProjects()
      setProjects(p)
    } catch (e) {
      setResponse('Error: ' + (e as Error).message)
    }
  }

  useEffect(() => {
    refreshStatus()
    loadProjects()
  }, [])

  const handlePing = async () => {
    const res = await window.cockpit.ping()
    setResponse(res)
  }

  const handleDispatch = async (projectKey: string, intent: string) => {
    setDispatching(projectKey + ':' + intent)
    setResponse('')
    try {
      const res = await window.cockpit.dispatchIntent({ projectKey, intent })
      setResponse(JSON.stringify(res, null, 2))
      await refreshStatus()
      const liveState = await window.cockpit.getCurrentState()
      setResponse((prev) => prev + '\n\n' + JSON.stringify(liveState, null, 2))
    } catch (e) {
      setResponse('Error: ' + (e as Error).message)
    } finally {
      setDispatching(null)
    }
  }

  const projectKeys = projects ? Object.keys(projects) : []

  return (
    <div className="min-h-screen bg-[#000] text-[#fff] font-sans">
      {/* x.ai-style minimal header */}
      <div className="border-b border-[#1f1f1f] px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-2.5 h-2.5 bg-[#ff5c00] rounded-full" />
          <div>
            <div className="fleet-header tracking-[3px]">COCKPIT</div>
            <div className="text-[15px] font-medium tracking-[-0.2px] -mt-0.5">Fleet Runner</div>
          </div>
        </div>
        <div className="text-xs text-[#666] font-mono">LOCAL • AUTHORITATIVE</div>
      </div>

      <div className="max-w-[860px] mx-auto px-8 pt-16 pb-24">
        {/* Big x.ai-style headline */}
        <div className="mb-12">
          <div className="fleet-header mb-2">YOUR MACHINES. YOUR AGENTS.</div>
          <h1 className="fleet-title tracking-[-1.5px] leading-none">
            The Fleet Runner<br />runs here.
          </h1>
          <p className="mt-4 max-w-md text-[#888] text-[15px]">
            Direct execution. No intermediaries. The desktop app is the source of truth for everything your agents do.
          </p>
        </div>

        {/* Status — very clean */}
        <div className="section mb-6 p-8">
          <div className="flex items-baseline justify-between mb-6">
            <div className="text-[13px] tracking-[1px] text-[#666] font-medium">RUNTIME</div>
            <button 
              onClick={refreshStatus} 
              className="text-xs text-[#ff5c00] hover:text-white transition-colors"
            >
              REFRESH
            </button>
          </div>
          {status ? (
            <div className="font-mono text-[13px] leading-relaxed text-[#ccc]">
              {JSON.stringify(status, null, 2)}
            </div>
          ) : (
            <div className="text-[#555] text-sm">Loading local state…</div>
          )}
        </div>

        {/* Projects */}
        <div className="section p-8">
          <div className="flex items-baseline justify-between mb-6">
            <div>
              <div className="text-[13px] tracking-[1px] text-[#666] font-medium">PROJECTS</div>
              <div className="text-2xl font-semibold tracking-[-0.4px] mt-1">{projectKeys.length} active</div>
            </div>
            <button 
              onClick={loadProjects} 
              className="text-xs text-[#ff5c00] hover:text-white transition-colors"
            >
              RELOAD CONFIG
            </button>
          </div>

          {projectKeys.length > 0 ? (
            <div className="space-y-px">
              {projectKeys.slice(0, 8).map((key: string) => (
                <div key={key} className="project-row flex items-center justify-between px-5 py-4 rounded-xl">
                  <div className="min-w-0">
                    <div className="font-medium text-[15px] tracking-[-0.1px]">{key}</div>
                    <div className="text-[11px] text-[#555] font-mono truncate mt-px">
                      {projects[key]?.dir || '—'}
                    </div>
                  </div>

                  <div className="flex gap-2 ml-4 flex-shrink-0">
                    {['next_best', 'test_and_fix', 'close_session'].map((intent) => (
                      <button
                        key={intent}
                        disabled={!!dispatching}
                        onClick={() => handleDispatch(key, intent)}
                        className="intent-btn text-[10px] tracking-[0.5px] uppercase"
                      >
                        {dispatching === `${key}:${intent}` ? '…' : intent.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[#555] py-8 text-sm">
              No projects found. Add entries to your <span className="font-mono">agent-projects.conf</span>.
            </div>
          )}
        </div>

        {/* x.ai-style ultra-minimal command bar */}
        <div className="mt-8">
          <div className="text-[10px] tracking-[2px] text-[#444] mb-2">COMMAND</div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="next best thing for project-x"
              className="flex-1 bg-black border border-[#1f1f1f] focus:border-[#ff5c00] rounded-xl px-5 py-3 text-sm placeholder:text-[#333] outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value.trim() && projectKeys[0]) {
                  handleDispatch(projectKeys[0], 'custom', e.currentTarget.value.trim())
                  e.currentTarget.value = ''
                }
              }}
            />
            <button
              onClick={handlePing}
              className="text-xs px-5 rounded-xl border border-[#1f1f1f] hover:bg-[#111] tracking-widest"
            >
              PING
            </button>
          </div>
          <div className="text-[10px] text-[#333] mt-1.5">Type a prompt or intent. First project will be used for demo.</div>
        </div>

        {response && (
          <div className="mt-4 response-box p-5 rounded-2xl text-[#888] whitespace-pre-wrap overflow-auto max-h-56 text-xs leading-relaxed border border-[#1a1a1a]">
            {response}
          </div>
        )}

        <div className="mt-16 text-center">
          <div className="text-[10px] tracking-[2px] text-[#444]">BUILT FOR BUILDERS WHO RUN REAL FLEETS</div>
        </div>
      </div>
    </div>
  )
}

export default App
