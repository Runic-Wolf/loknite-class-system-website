(() => {
  const api = '/api/v1/';
  const workspaceChanges = import('/workspace-changes.js');
  let legacyState;
  let revision;
  let stale = false;
  let pending = 0;
  let saveFailed = false;

  window.addEventListener('beforeunload', event => {
    if (pending || saveFailed || stale) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  async function request(path, { method = 'GET', body, bytes, versioned = false } = {}) {
    if (versioned && stale) throw new Error('Recarregue a página para continuar editando a revisão atual.');
    const headers = { 'X-LCS-Client': 'browser' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (versioned) {
      if (!Number.isSafeInteger(revision)) throw new Error('O Vault ainda está carregando.');
      headers['If-Match'] = '"' + revision + '"';
      pending++;
    }
    try {
      const response = await fetch(api + path, {
        method, headers, body: bytes ?? (body === undefined ? undefined : JSON.stringify(body)),
        credentials: 'same-origin', cache: 'no-store'
      });
      if (response.redirected) throw new Error('Sua sessão expirou. Reabra o Lok’nite para entrar novamente.');
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (versioned && result.code === 'REVISION_CONFLICT') {
          stale = true;
          showConflict();
        }
        throw new Error(result.error ?? 'Não foi possível acessar o Vault.');
      }
      if ((versioned || revision === undefined) && result.vault?.revision !== undefined) {
        revision = result.vault.revision;
        legacyState = result.legacy;
      }
      if (versioned) saveFailed = false;
      return result;
    } catch (error) {
      if (versioned) saveFailed = true;
      throw error;
    } finally {
      if (versioned) pending--;
    }
  }

  function showConflict() {
    if (document.querySelector('#web-conflict')) return;
    const alert = document.createElement('aside');
    alert.id = 'web-conflict';
    alert.setAttribute('role', 'alert');
    alert.append('Outra pessoa salvou uma revisão mais recente. Copie suas mudanças antes de recarregar.');
    const reload = document.createElement('button');
    reload.textContent = 'Recarregar';
    reload.onclick = () => {
      stale = false;
      saveFailed = false;
      location.reload();
    };
    alert.append(reload);
    document.body.append(alert);
  }

  function addAccount(session) {
    document.documentElement.dataset.lcsAdmin = String(session.admin);
    const header = document.querySelector('#bottom');
    if (!header) return;
    const account = document.createElement('details');
    account.className = 'web-account';
    const button = document.createElement('summary');
    button.textContent = 'Conta';
    button.title = session.email;
    const items = document.createElement('div');
    const email = document.createElement('span');
    email.textContent = session.email;
    items.append(email);
    for (const [label, href] of [['Baixar Vault', api + 'exports'], ...(!session.local ? [['Sair', '/cdn-cgi/access/logout']] : [])]) {
      const link = document.createElement('a');
      link.textContent = label;
      link.href = href;
      items.append(link);
    }
    if (session.admin) {
      const backups = document.createElement('button');
      backups.type = 'button';
      backups.textContent = 'Restaurar backup';
      backups.onclick = openBackups;
      items.append(backups);
    }
    account.append(button, items);
    header.after(account);
  }

  async function openBackups() {
    const dialog = document.createElement('dialog');
    dialog.className = 'web-backups';
    dialog.setAttribute('aria-labelledby', 'backups-title');
    const title = document.createElement('h2');
    title.id = 'backups-title';
    title.textContent = 'Restaurar backup';
    const info = document.createElement('p');
    info.setAttribute('role', 'status');
    const selectLabel = document.createElement('label');
    selectLabel.textContent = 'Escolha uma revisão';
    const select = document.createElement('select');
    selectLabel.append(select);
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Cancelar';
    close.onclick = () => dialog.close();
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.textContent = 'Restaurar revisão';
    restore.disabled = true;
    restore.onclick = async () => {
      if (pending || saveFailed || stale) {
        info.textContent = 'Resolva o salvamento pendente antes de restaurar.';
        return;
      }
      restore.disabled = true;
      try {
        await request('backups/restore', { method: 'POST', body: { id: select.value }, versioned: true });
        location.reload();
      } catch (error) {
        info.textContent = error.message;
        restore.disabled = false;
      }
    };
    dialog.append(title, info, selectLabel, close, restore);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.append(dialog);
    info.textContent = 'Carregando backups…';
    dialog.showModal();
    close.focus();
    try {
      const entries = await request('backups');
      for (const entry of entries) {
        const option = document.createElement('option');
        option.value = entry.id;
        option.textContent = 'Revisão ' + entry.revision + ' · ' + new Date(entry.createdAt).toLocaleString('pt-BR');
        select.append(option);
      }
      info.textContent = entries.length ? 'A revisão escolhida será gravada como uma nova revisão do Vault.' : 'Nenhum backup salvo.';
      restore.disabled = !entries.length;
    } catch (error) {
      info.textContent = error.message;
    }
  }

  let intent;
  document.addEventListener('click', event => {
    const submit = event.target.closest('#modalForm[data-desktop-editorial="true"] button[type="submit"]');
    if (!event.isTrusted || !submit || submit.disabled) return;
    const form = submit.form;
    intent = { id: form.dataset.desktopEditorialCardId, action: form.dataset.desktopEditorialAction, expires: Date.now() + 2000 };
  }, true);

  async function editorial(action, id) {
    const click = intent;
    intent = null;
    if (click?.id !== id || click.action !== action || click.expires < Date.now()) {
      throw new Error('Confirme a ação no modal da carta.');
    }
    return request('cards/' + action, { method: 'POST', body: { id }, versioned: true });
  }

  function mutate(path, body, method = 'POST') {
    return request(path, { method, body, versioned: true });
  }

  window.lcsDesktop = Object.freeze({
    mode: Object.freeze({ web: true, nativeChrome: false }),
    vault: Object.freeze({
      load: () => request('workspace'),
      saveLegacy: async legacy => {
        const { createChanges } = await workspaceChanges;
        if (!legacyState) throw new Error('O Vault ainda está carregando.');
        return mutate('workspace', createChanges(legacyState, legacy), 'PATCH');
      },
      importLegacy: legacy => mutate('import/legacy', legacy),
      confirm: id => editorial('confirm', id),
      unconfirm: id => editorial('unconfirm', id),
      deleteSkill: (id, disposition) => mutate('skills/delete', { id, disposition }),
      deleteCards: ids => mutate('cards/delete', { ids }),
      exportBackup: () => request('backups', { method: 'POST' }),
      recover: id => mutate('backups/restore', { id }),
      hasConflict: () => stale
    }),
    media: Object.freeze({
      import: bytes => request('media', { method: 'POST', bytes }),
      resolve: path => Promise.resolve('/media/' + path.split('/').map(encodeURIComponent).join('/')),
      officialPalette: () => request('assets')
    }),
    app: Object.freeze({
      ready: async () => {
        if (document.querySelector('.web-account')) return;
        try { addAccount(await request('session')); } catch { /* The workspace already reports load failures. */ }
      },
      reportStatus: async () => {},
      onFlushRequired: () => () => {}
    })
  });
})();
