/* Doggy Style – App Core
   Master Konsolidierung – Aufenthalt als Kernobjekt
*/

const App = {
  state: {
    view: 'dashboard',
    filter: 'active',
    user: null,
    data: {
      customers: [],
      dogs: [],
      stays: [],
      contracts: []
    }
  },

  init() {
    this.restoreContext();
    this.render();
  },

  restoreContext() {
    const body = document.body;
    this.state.view = body.dataset.defaultView || 'dashboard';
    this.state.filter = body.dataset.defaultFilter || 'active';
  },

  render() {
    const root = document.getElementById('app');
    if (!root) return;

    root.innerHTML = '';
    root.appendChild(this.renderDashboard());
  },

  /* ---------------- DASHBOARD ---------------- */

  renderDashboard() {
    const wrap = document.createElement('div');
    wrap.className = 'dashboard';

    wrap.appendChild(this.renderToday());
    wrap.appendChild(this.renderCapacity());
    wrap.appendChild(this.renderQuickActions());

    return wrap;
  },

  renderToday() {
    const box = document.createElement('div');
    box.className = 'card today';

    const now = new Date();
    const dateStr = now.toLocaleDateString('de-DE', {
      weekday: 'long',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    const activeStays = this.getActiveStaysToday();

    box.innerHTML = `
      <h2>Heute</h2>
      <div class="today-date">${dateStr}</div>
      <div class="today-status">
        ${activeStays.length === 0
          ? '0 aktiv – ruhiger Tag'
          : `${activeStays.length} aktiv`}
      </div>
    `;

    return box;
  },

  renderCapacity() {
    const box = document.createElement('div');
    box.className = 'card capacity';

    const todayStays = this.getActiveStaysToday();
    const dayCare = todayStays.filter(s => s.type === 'daycare').length;
    const vacation = todayStays.filter(s => s.type === 'vacation').length;

    box.innerHTML = `
      <h2>Kapazität</h2>
      <div class="capacity-grid">
        <div class="cap-box">
          <strong>${dayCare} / 13</strong>
          <span>Tagesbetreuung</span>
        </div>
        <div class="cap-box">
          <strong>${vacation} / 10</strong>
          <span>Urlaubsbetreuung</span>
        </div>
      </div>
    `;

    return box;
  },

  renderQuickActions() {
    const box = document.createElement('div');
    box.className = 'card actions';

    box.innerHTML = `
      <button data-action="new-dog">+ Hund</button>
      <button data-action="new-stay">+ Aufenthalt</button>
      <button data-action="calendar">Kalender</button>
      <button data-action="contracts">Verträge</button>
    `;

    return box;
  },

  /* ---------------- LOGIK ---------------- */

  getActiveStaysToday() {
    const today = new Date().toISOString().split('T')[0];

    return this.state.data.stays.filter(stay => {
      if (stay.status !== 'active') return false;
      if (stay.type === 'daycare') {
        return stay.start === today;
      }
      if (stay.type === 'vacation') {
        return stay.start <= today && stay.end >= today;
      }
      return false;
    });
  }
};

/* Init */
document.addEventListener('DOMContentLoaded', () => App.init());