/* A team login crosses two pages in the installed Workspace. Only that navigation uses session storage. */
(function(){
  'use strict';
  const handoffKey = 'ds_workspace_login_handoff';

  function isStandalone(){
    return navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  }

  function beginWorkspaceLogin(uid){
    sessionStorage.setItem(handoffKey, JSON.stringify({ uid, expiresAt: Date.now() + 60000 }));
  }

  function takeWorkspaceLogin(){
    try{
      const value = sessionStorage.getItem(handoffKey);
      sessionStorage.removeItem(handoffKey);
      const handoff = JSON.parse(value);
      return handoff?.expiresAt >= Date.now() && typeof handoff.uid === 'string' ? handoff.uid : '';
    }catch(_){
      return '';
    }
  }

  window.DSAuthSession = { isStandalone, beginWorkspaceLogin, takeWorkspaceLogin };
})();
