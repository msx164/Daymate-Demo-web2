import { CommunityPage, AccountMenu } from './web2/CommunityPage.jsx';
import { useEffect, useState } from "react";
import { request, saveFocus } from "./api.js";
import { useFocusSession } from "./hooks/useFocusSession.js";
import { useDashboard } from "./hooks/useDashboard.js";
import { useTaskActions } from "./hooks/useTaskActions.js";
import { FocusSetup } from "./components/FocusSetup.jsx";
import { FocusOverlay } from "./components/FocusOverlay.jsx";
import { TaskForm } from "./components/TaskForm.jsx";
import { TaskPanel } from "./components/TaskPanel.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { CompanionScene } from "./components/CompanionScene.jsx";
import { useCompanionAppearance } from "./hooks/useCompanionAppearance.js";
import { useLive2DDisplay } from './hooks/useLive2DDisplay.js';
import { companionState } from "./companionAppearance.js";
import { usePetCompanion } from "./hooks/usePetCompanion.js";
import { StatsCards } from "./components/StatsCards.jsx";
import { CompanionPanel } from "./components/CompanionPanel.jsx";
import { FocusTrend } from "./components/FocusTrend.jsx";
import { formatFocusDuration } from "./dashboardUtils.js";
import { isTaskCreateUncertain } from "./taskSubmission.js";
import { DeletedTasks } from "./components/DeletedTasks.jsx";
import { DesktopControls } from "./components/DesktopControls.jsx";
import { useAppNavigation } from './hooks/useAppNavigation.js';
import { SettingsPanel } from './components/SettingsPanel.jsx';
import { PageWorkspace } from './components/PageWorkspace.jsx';
import { FocusExplorer } from './components/FocusExplorer.jsx';
import { resolveActivity } from './companionActivities.js';
import { useActivityProps } from './hooks/useActivityProps.js';
import { VideoCompanion } from './components/VideoCompanion.jsx';
import { HabitPanel } from './components/HabitPanel.jsx';
import { AiTaskPlanner } from './components/AiTaskPlanner.jsx';
import { activityDraft } from './activityPresets.js';
import "./App.css";
import './Immersive.css';

function App() {
  const { page, navigate } = useAppNavigation();
  const dashboard = useDashboard();
  const focus = useFocusSession();
  const appearance = useCompanionAppearance();
  const live2d = useLive2DDisplay(!!focus.focusTask,appearance.settings.character);
  const [replying, setReplying] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [companionPane,setCompanionPane]=useState(null);
  const callActive = callOpen && page === 'companion' && !focus.focusTask;
  useEffect(() => {
    const bridge = window.daymateDesktop;
    if (!bridge?.proactive) return;
    void bridge.proactive('busy', !!focus.focusTask || replying || speaking || callActive).catch(() => {});
    return () => { void bridge.proactive('busy', true).catch(() => {}); };
  }, [focus.focusTask, replying, speaking, callActive]);
  const goToPage = next => { setCallOpen(false);setCompanionPane(null); navigate(next); };
  useEffect(() => {
    const closeCall = () => setCallOpen(false);
    window.addEventListener('popstate', closeCall);
    window.addEventListener('hashchange', closeCall);
    return () => { window.removeEventListener('popstate', closeCall); window.removeEventListener('hashchange', closeCall); };
  }, []);
  const visualState = companionState({ hasFocus: !!focus.focusTask, isFocusing: focus.isFocusing,
    isSaving: focus.isSaving, timeLeft: focus.timeLeft, replying, speaking });
  const activity = resolveActivity(appearance.settings.activity, focus.focusTask);
  const props = useActivityProps(activity);
  const petWarning = usePetCompanion({ character: appearance.settings.character, motion: appearance.settings.motion, state: visualState, activity, propSettings:props.value });
  const actions = useTaskActions(dashboard.updateTasks);
  const [scope, setScope] = useState("today");
  const [setupTask, setSetupTask] = useState(null);
  const [setupMinutes, setSetupMinutes] = useState(undefined), [quickDraft,setQuickDraft] = useState(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskDraft, setTaskDraft] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [homePlanning, setHomePlanning] = useState(false);
  const [notice, setNotice] = useState("");
  const { data, loading, error } = dashboard;
  const todayTasks = data?.tasks.filter((task) => task.task_date === data.total.today_date) ?? [];
  const completedCount = todayTasks.filter((task) => task.completed).length;
  const openTaskModal = () => { setQuickDraft(null); setEditingTask(null); setTaskDraft(null); setShowTaskForm(true); };
  const reviewTaskDraft = (draft) => { setQuickDraft(null); setEditingTask(null); setTaskDraft(draft); setShowTaskForm(true); };
  const editTask = (task) => { setQuickDraft(null); setTaskDraft(null); setEditingTask(task); setShowTaskForm(true); };
  function prepareFocus(task,minutes) { setCallOpen(false); setSetupTask(task); setSetupMinutes(minutes); }
  function quickStart() {
    const next = todayTasks.find(task => !task.completed);
    if (next) { prepareFocus(next, 25); return; }
    const draft = activityDraft('reading');
    draft.activity = 'working';
    draft.task.name = '';
    draft.task.task_type = '学习';
    setQuickDraft(draft); setEditingTask(null); setTaskDraft(draft.task); setShowTaskForm(true);
  }

  async function createTask(task, requestKey) {
    let created;
    try {
      created = await request("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey }, body: JSON.stringify(task) });
    } catch (error) {
      if (isTaskCreateUncertain(error)) await dashboard.refresh();
      throw error;
    }
    dashboard.updateTasks((tasks) => [...tasks.filter((item) => item.id !== created.id), created]);
    if (!dashboard.data) await dashboard.refresh();
    setNotice(`已创建任务：${created.name}`);
    if (created.task_date !== data?.total.today_date) setScope("all");
    if(quickDraft) { appearance.update({activity:quickDraft.activity});prepareFocus(created,quickDraft.minutes); }
  }
  async function saveEditedTask(task) {
    const updated = await request(`/api/tasks/${editingTask.id}`, { method: "PATCH",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(task) });
    dashboard.updateTasks((tasks) => tasks.map((item) => item.id === updated.id ? updated : item));
    setNotice(`已更新任务：${updated.name}`);
    if (updated.task_date !== data?.total.today_date) setScope("all");
  }
  function restoredTask(task) {
    dashboard.updateTasks((tasks) => [...tasks.filter((item) => item.id !== task.id), task]);
    setNotice(`已恢复任务：${task.name}`);
    if (task.task_date !== data?.total.today_date) setScope("all");
  }
  async function finishFocus(completeTask) {
    let snapshot;
    try { snapshot = await focus.finish(completeTask, saveFocus); }
    catch { return; } // The controller retains the frozen record and displays the error.
    if (!snapshot) return;
    if (completeTask) dashboard.updateTasks((tasks) => tasks.map((task) => task.id === snapshot.task_id ? { ...task, completed: true } : task));
    setNotice(`${completeTask ? "任务已完成" : "专注已结束"}，本次 ${formatFocusDuration(snapshot.seconds)}。`);
    await dashboard.refresh(); // Read failure never retries the committed record.
  }
  function discardFocus() {
    if (window.confirm("确定放弃本地专注草稿？未保存的时长将丢失；已在服务器保存的记录会保留。")) focus.discard();
  }
  async function prepareSoloAction({ goal, minutes }) {
    let task = data?.tasks.find(item => item.name === goal && !item.completed);
    if (!task) {
      const localDate = data?.total.today_date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
      const startTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
      const [hour, minute] = startTime.split(':').map(Number);
      const endMinutes = (hour * 60 + minute + minutes) % 1440;
      const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
      task = await request('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ name: goal, start_time: startTime, end_time: endTime, task_type: 'study', task_date: localDate }) });
      dashboard.updateTasks(items => [...items.filter(item => item.id !== task.id), task]);
    }
    goToPage('companion');
    prepareFocus(task, minutes);
    setNotice('目标已带入私人专注，请确认时长后和 Day 开始。');
  }
  const communityPage = ['together', 'buddies', 'action-history'].includes(page);
  return <div className="app"><div className="workspace-shell" inert={!!focus.focusTask}><Sidebar page={page} onNavigate={goToPage} /><main className="main" data-page={page}>
    <div hidden={page!=='settings'}>
    <details className="settings-advanced"><summary>桌面与通知</summary><DesktopControls /></details>
    </div>
    {petWarning && <p className="form-hint" role="status">{petWarning}</p>}
    {error && <div className="connection-error" role="alert"><span>{error}</span><button disabled={loading} onClick={dashboard.refresh}>重试</button></div>}
    {notice && <div className="status-notice" role="status"><span>{notice}</span><button aria-label="关闭通知" onClick={() => setNotice("")}>×</button></div>}
    {!focus.focusTask && focus.storageWarning && <p className="form-error" role="status">{focus.storageWarning}</p>}
    <header className="header"><div><div className="greeting">你好 👋</div><h1>{({ home: '今天', tasks: '任务管理', focus: '专注与记录', companion: '陪伴空间', settings: '设置', together: '一起做完', buddies: '我的搭子', 'action-history': '同行记录' })[page]}</h1></div>
      <div className="header-right"><AccountMenu /><button className="icon-button" disabled={loading} onClick={dashboard.refresh} aria-label="刷新数据">↻</button><div className="user-avatar">你</div></div></header>
    {page === 'home' && <div className="home-intro"><p>选一个小目标，今天就从这里开始。</p><button className="home-together-link" onClick={() => goToPage('together')}>找人一起做 ↗</button></div>}
    {communityPage ? <CommunityPage page={page} navigate={goToPage} tasks={data?.tasks ?? []} onSolo={prepareSoloAction} /> : <>
    {page!=='companion' && !callActive && <PageWorkspace page={page} tasks={data?.tasks ?? []} date={data?.total.today_date} onAdd={openTaskModal}
      onTasks={() => goToPage('tasks')} onStart={prepareFocus} pending={actions.pending} />}
    {page==='companion'&&<div className="immersive-header" data-call={callActive}><span className="immersive-brand">DAYMATE <small>陪伴</small></span><div>{!callActive&&<><button aria-expanded={companionPane==='appearance'} onClick={()=>setCompanionPane(companionPane==='appearance'?null:'appearance')}>外观</button><button aria-expanded={companionPane==='chat'} onClick={()=>setCompanionPane(companionPane==='chat'?null:'chat')}>聊天</button><button onClick={()=>goToPage('home')}>返回首页</button></>}</div></div>}
    {page === 'companion' && !callActive && <section className="call-entry"><button className="primary-button" disabled={!!focus.focusTask} onClick={() => {setCompanionPane(null);setCallOpen(true);}}>开始陪伴</button><span>语音与摄像头按需开启</span></section>}
    {callActive && <VideoCompanion appearance={appearance} live2d={live2d} state={visualState} activity={activity} propSettings={props.value} onClose={() => {setCallOpen(false);setCompanionPane(null);}} onChat={()=>setCompanionPane(companionPane==='chat'?null:'chat')} />}
    <div hidden={page !== 'companion' || callActive}>
    <CompanionScene appearance={appearance} live2d={live2d} activity={activity} activityProps={props} visible={page === 'companion' && !callActive} openTaskModal={openTaskModal} state={visualState} compact={page==='companion'} controlsOpen={companionPane==='appearance'} />
    </div>
    {page === 'settings' && <SettingsPanel appearance={appearance} onCompanion={() => navigate('companion')} readingPreviewVisible={!focus.focusTask} />}
    {loading && <p className="loading-message" role="status">{data ? "正在更新数据…" : "正在加载任务与统计…"}</p>}
    {data && <div hidden={page !== 'focus'}>
      <StatsCards completedCount={completedCount} todayTasks={todayTasks}
        completionRate={todayTasks.length ? Math.round(completedCount / todayTasks.length * 100) : 0}
        todayFocusSeconds={data.total.today_seconds} totalFocusSeconds={data.total.total_seconds}
        companionDays={data.companionDays} focusStreak={data.streak} /></div>}
      <section className="content-grid" hidden={['settings', 'focus'].includes(page)} data-single={page !== 'home'}><div hidden={page === 'companion'}>{data ? <TaskPanel onQuickStart={page === 'home' ? quickStart : undefined} quickStartDisabled={loading || !!setupTask || showTaskForm} expanded={page === 'tasks'} tasks={data.tasks} date={data.total.today_date} scope={scope} onScope={setScope}
        onAdd={openTaskModal} onStart={prepareFocus} onToggle={actions.toggle} onDelete={actions.remove}
        onEdit={editTask} onDeleted={() => setShowDeleted(true)} pending={actions.pending} error={actions.error} />
        : <div className="panel"><div className="panel-title">今日任务</div><p className="loading-message">
          {error ? "任务暂时无法读取，请检查连接后重试。" : "正在读取任务…"}</p></div>}</div>
        <div className={page==='companion'?'session-drawer companion-chat-drawer':undefined} hidden={['tasks', 'focus'].includes(page)||(page==='companion'&&companionPane!=='chat')}>
          {page==='companion'&&<div className="drawer-heading"><h2>和 Day 聊聊</h2><button aria-label="收起聊天" onClick={()=>setCompanionPane(null)}>×</button></div>}
          <CompanionPanel key={page === 'home' ? 'home-chat' : 'full-chat'} compact={page === 'home'} onWriteDraft={() => setHomePlanning(true)} onOpenCompanion={() => {goToPage('companion');setCompanionPane('chat');}} tasks={todayTasks} onReviewTask={reviewTaskDraft} onBusyChange={setReplying} onSpeakingChange={setSpeaking} character={appearance.settings.character} /></div></section>
    {page==='companion'&&companionPane==='appearance'&&<button className="appearance-close" aria-label="收起外观设置" onClick={()=>setCompanionPane(null)}>×</button>}
    {page === 'tasks' && data && <HabitPanel key={data.total.today_date} />}
    {data && <div hidden={page !== 'focus'}>
      <FocusExplorer refreshToken={data.sessions} /><FocusTrend weekFocusData={data.week} />
    </div>}
    </>}
  </main></div>
    {showTaskForm && <TaskForm initialTask={editingTask ?? taskDraft} editing={!!editingTask} tasks={data?.tasks ?? []}
      draftTitle={quickDraft ? '快速开始 · 确认本轮目标' : undefined}
      onCreate={editingTask ? saveEditedTask : createTask}
      onClose={() => { setShowTaskForm(false); setTaskDraft(null); setEditingTask(null); setQuickDraft(null); }} />}
    {showDeleted && <DeletedTasks onRestore={restoredTask} onClose={() => setShowDeleted(false)} />}
    {homePlanning && <AiTaskPlanner onClose={() => setHomePlanning(false)} onReview={draft => { setHomePlanning(false); reviewTaskDraft(draft); }} />}
    {setupTask && <FocusSetup task={setupTask} suggestedMinutes={setupMinutes} onClose={() => setSetupTask(null)} onStart={(duration) => focus.start(setupTask, duration)} />}
    {focus.focusTask && <FocusOverlay focus={focus} character={appearance.settings.character} motion={appearance.settings.motion}
      activity={activity} activitySelection={appearance.settings.activity} onActivityChange={value => appearance.update({activity:value})}
      propSettings={props.value} scene={appearance.settings.scene}
      live2d={live2d} onFinish={finishFocus} onDiscard={discardFocus} />}
  </div>;
}
export default App;
