const auth = firebase.auth();

function showLogin(){
  document.getElementById('loginOverlay').style.display='block';
  document.getElementById('workspace').classList.add('hidden');
}

function showWorkspace(){
  document.getElementById('loginOverlay').style.display='none';
  document.getElementById('workspace').classList.remove('hidden');
}

auth.onAuthStateChanged(user=>{
  if(user){ showWorkspace(); }
  else { showLogin(); }
});

function login(){
  const e=email.value,p=password.value;
  auth.signInWithEmailAndPassword(e,p).catch(alert);
}

function logout(){
  auth.signOut();
}
