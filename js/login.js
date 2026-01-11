// login.js (renamed from auth.js)
import { auth } from './firebase-init.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
  const $ = (id)=>document.getElementById(id);
  const msg = (t)=>{ const el=$('authMsg'); if(el) el.textContent=t||''; };

  const elEmail = $('loginEmail');
  const elPass  = $('loginPass');
  const btnLogin = $('btnLogin');
  const btnRegister = $('btnRegister');
  const btnForgot = $('btnForgot');

  async function doLogin(){
    try{
      await signInWithEmailAndPassword(auth, elEmail.value.trim(), elPass.value.trim());
      location.href='app.html';
    }catch(e){
      msg(e.message);
    }
  }

  btnLogin && btnLogin.addEventListener('click', e=>{e.preventDefault(); doLogin();});
  elPass && elPass.addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });

  btnForgot && btnForgot.addEventListener('click', async ()=>{
    try{
      await sendPasswordResetEmail(auth, elEmail.value.trim());
      msg('Reset-Link gesendet.');
    }catch(e){ msg(e.message); }
  });
});
