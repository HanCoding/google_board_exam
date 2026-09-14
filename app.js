"use strict";

const CONFIG = window.BOARD_CONFIG || {};
const TOKEN_STORAGE_KEY = "board.googleCredential";

const state = {
  posts: [],
  credential: sessionStorage.getItem(TOKEN_STORAGE_KEY) || "",
  user: null,
  currentPost: null,
  editorMode: "create",
  toastTimer: null,
};

const elements = {};

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  collectElements();
  bindEvents();
  registerServiceWorker();

  const configured = isConfigured();
  elements.setupNotice.hidden = configured;

  await initializeGoogleSignIn();

  if (state.credential && configured) {
    await restoreSession();
  } else {
    renderAuthState();
  }

  if (configured) {
    await loadPosts();
  } else {
    setBoardState("empty");
    elements.emptyTitle.textContent = "연결 설정을 완료해 주세요.";
    elements.emptyDescription.textContent = "config.js에 두 설정값을 입력하면 게시글이 표시됩니다.";
  }
}

function registerServiceWorker() {
  // file:// 로 직접 열었거나 지원하지 않는 브라우저에서는 조용히 넘어갑니다.
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./sw.js");

      // 이미 동작 중인 앱 위에 새 버전이 설치되면 새로고침을 안내합니다.
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing || !navigator.serviceWorker.controller) return;

        installing.addEventListener("statechange", () => {
          if (installing.state === "installed") {
            showToast("새 버전이 준비되었습니다. 새로고침해 주세요.");
          }
        });
      });
    } catch (error) {
      console.warn("서비스 워커 등록에 실패했습니다.", error);
    }
  });
}

function collectElements() {
  [
    "signedOutArea",
    "signedInArea",
    "googleSignIn",
    "userPicture",
    "userName",
    "logoutButton",
    "writeButton",
    "searchInput",
    "setupNotice",
    "loadingState",
    "errorState",
    "errorMessage",
    "retryButton",
    "emptyState",
    "emptyTitle",
    "emptyDescription",
    "postList",
    "postCount",
    "refreshButton",
    "detailDialog",
    "detailTitle",
    "detailAuthor",
    "detailDate",
    "detailEdited",
    "detailContent",
    "detailActions",
    "editButton",
    "deleteButton",
    "editorDialog",
    "postForm",
    "editorTitle",
    "titleInput",
    "contentInput",
    "titleCount",
    "contentCount",
    "submitButton",
    "toast",
  ].forEach((id) => {
    elements[id] = document.getElementById(id);
  });
}

function bindEvents() {
  elements.writeButton.addEventListener("click", () => openEditor("create"));
  elements.logoutButton.addEventListener("click", logout);
  elements.retryButton.addEventListener("click", loadPosts);
  elements.refreshButton.addEventListener("click", loadPosts);
  elements.searchInput.addEventListener("input", renderPosts);
  elements.editButton.addEventListener("click", () => openEditor("edit"));
  elements.deleteButton.addEventListener("click", deleteCurrentPost);
  elements.postForm.addEventListener("submit", submitPost);
  elements.titleInput.addEventListener("input", updateCharacterCounts);
  elements.contentInput.addEventListener("input", updateCharacterCounts);

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(document.getElementById(button.dataset.closeDialog)));
  });

  [elements.detailDialog, elements.editorDialog].forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
  });
}

function isConfigured() {
  return Boolean(
    CONFIG.GOOGLE_CLIENT_ID &&
      !CONFIG.GOOGLE_CLIENT_ID.startsWith("YOUR_") &&
      CONFIG.APPS_SCRIPT_URL &&
      !CONFIG.APPS_SCRIPT_URL.includes("YOUR_DEPLOYMENT_ID"),
  );
}

async function initializeGoogleSignIn() {
  if (!CONFIG.GOOGLE_CLIENT_ID || CONFIG.GOOGLE_CLIENT_ID.startsWith("YOUR_")) return;

  try {
    await waitForGoogleLibrary();
    google.accounts.id.initialize({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      callback: handleGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    renderGoogleButton();
  } catch (error) {
    console.error(error);
    showToast("Google 로그인 버튼을 불러오지 못했습니다.", "error");
  }
}

function waitForGoogleLibrary() {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (window.google?.accounts?.id) {
        window.clearInterval(timer);
        resolve();
      } else if (Date.now() - startedAt > 10000) {
        window.clearInterval(timer);
        reject(new Error("Google Identity Services 로딩 시간 초과"));
      }
    }, 100);
  });
}

function renderGoogleButton() {
  if (!window.google?.accounts?.id) return;
  elements.googleSignIn.replaceChildren();
  google.accounts.id.renderButton(elements.googleSignIn, {
    type: "standard",
    theme: "outline",
    size: "medium",
    text: "signin_with",
    shape: "pill",
    locale: "ko",
  });
}

async function handleGoogleCredential(response) {
  if (!response?.credential) return;

  try {
    const result = await apiRequest("verify", { credential: response.credential }, false);
    state.credential = response.credential;
    state.user = result.user;
    sessionStorage.setItem(TOKEN_STORAGE_KEY, state.credential);
    renderAuthState();
    await loadPosts();
    showToast(`${state.user.name}님, 반갑습니다.`);
  } catch (error) {
    clearSession();
    showToast(error.message, "error");
  }
}

async function restoreSession() {
  try {
    const result = await apiRequest("verify", { credential: state.credential }, false);
    state.user = result.user;
  } catch (error) {
    clearSession();
  }
  renderAuthState();
}

function logout() {
  clearSession();
  if (window.google?.accounts?.id) {
    google.accounts.id.disableAutoSelect();
    renderGoogleButton();
  }
  renderAuthState();
  closeDialog(elements.detailDialog);
  loadPosts();
  showToast("로그아웃했습니다.");
}

function clearSession() {
  state.credential = "";
  state.user = null;
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}

function renderAuthState() {
  const signedIn = Boolean(state.user);
  elements.signedOutArea.hidden = signedIn;
  elements.signedInArea.hidden = !signedIn;

  if (signedIn) {
    elements.userName.textContent = state.user.name;
    if (state.user.picture) {
      elements.userPicture.src = state.user.picture;
      elements.userPicture.alt = `${state.user.name} 프로필 사진`;
      elements.userPicture.hidden = false;
    } else {
      elements.userPicture.hidden = true;
    }
  }
}

async function loadPosts() {
  if (!isConfigured()) return;

  setBoardState("loading");
  try {
    const result = await apiRequest("list", {}, true);
    state.posts = result.posts || [];
    renderPosts();
  } catch (error) {
    if (isAuthError(error)) {
      try {
        const result = await apiRequest("list", {}, false);
        state.posts = result.posts || [];
        renderPosts();
        showToast("로그인이 만료되어 로그아웃했습니다.", "error");
        return;
      } catch (retryError) {
        error = retryError;
      }
    }
    setBoardState("error");
    elements.errorMessage.textContent = error.message;
  }
}

function renderPosts() {
  const query = elements.searchInput.value.trim().toLocaleLowerCase("ko-KR");
  const filtered = state.posts.filter((post) => {
    if (!query) return true;
    return `${post.title} ${post.content} ${post.authorName}`.toLocaleLowerCase("ko-KR").includes(query);
  });

  elements.postList.replaceChildren();
  elements.postCount.textContent = query
    ? `검색 결과 ${filtered.length}개 · 전체 ${state.posts.length}개`
    : `총 ${state.posts.length}개의 글`;

  if (!filtered.length) {
    setBoardState("empty");
    elements.emptyTitle.textContent = query ? "검색 결과가 없습니다." : "아직 작성된 글이 없습니다.";
    elements.emptyDescription.textContent = query
      ? "다른 검색어를 입력해 보세요."
      : "첫 번째 이야기를 남겨 보세요.";
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach((post) => fragment.append(createPostCard(post)));
  elements.postList.append(fragment);
  setBoardState("list");
}

function createPostCard(post) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "post-card";
  button.addEventListener("click", () => openPost(post.id));

  const body = document.createElement("div");
  const title = document.createElement("h3");
  const preview = document.createElement("p");
  const meta = document.createElement("div");
  const author = document.createElement("span");
  const divider = document.createElement("span");
  const date = document.createElement("time");
  const arrow = document.createElement("span");

  title.textContent = post.title;
  preview.className = "post-preview";
  preview.textContent = post.content.replace(/\s+/g, " ");
  meta.className = "post-meta";
  author.textContent = post.authorName;
  divider.textContent = "·";
  date.dateTime = post.createdAt;
  date.textContent = formatDate(post.createdAt);
  arrow.className = "post-arrow";
  arrow.textContent = "›";
  arrow.setAttribute("aria-hidden", "true");

  meta.append(author, divider, date);
  if (post.canEdit) {
    const mine = document.createElement("span");
    mine.className = "mine-badge";
    mine.textContent = "내 글";
    meta.append(mine);
  }

  body.append(title, preview, meta);
  button.append(body, arrow);
  return button;
}

async function openPost(postId) {
  try {
    const result = await apiRequest("get", { postId }, true);
    state.currentPost = result.post;
    renderPostDetail();
    elements.detailDialog.showModal();
  } catch (error) {
    if (isAuthError(error)) {
      try {
        const result = await apiRequest("get", { postId }, false);
        state.currentPost = result.post;
        renderPostDetail();
        elements.detailDialog.showModal();
        showToast("로그인이 만료되어 로그아웃했습니다.", "error");
        return;
      } catch (retryError) {
        error = retryError;
      }
    }
    showToast(error.message, "error");
  }
}

function renderPostDetail() {
  const post = state.currentPost;
  if (!post) return;

  elements.detailTitle.textContent = post.title;
  elements.detailAuthor.textContent = post.authorName;
  elements.detailDate.dateTime = post.createdAt;
  elements.detailDate.textContent = formatDate(post.createdAt, true);
  elements.detailContent.textContent = post.content;
  elements.detailEdited.hidden = !post.updatedAt || post.updatedAt === post.createdAt;
  elements.detailActions.hidden = !post.canEdit;
}

function openEditor(mode) {
  if (!state.user) {
    showToast("글을 작성하려면 Google 로그인이 필요합니다.", "error");
    elements.googleSignIn.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (mode === "edit" && !state.currentPost?.canEdit) {
    showToast("본인이 작성한 글만 수정할 수 있습니다.", "error");
    return;
  }

  state.editorMode = mode;
  elements.editorTitle.textContent = mode === "edit" ? "글 수정" : "새 글 작성";
  elements.submitButton.textContent = mode === "edit" ? "수정 완료" : "등록하기";
  elements.titleInput.value = mode === "edit" ? state.currentPost.title : "";
  elements.contentInput.value = mode === "edit" ? state.currentPost.content : "";
  updateCharacterCounts();
  closeDialog(elements.detailDialog);
  elements.editorDialog.showModal();
  window.setTimeout(() => elements.titleInput.focus(), 50);
}

async function submitPost(event) {
  event.preventDefault();

  const title = elements.titleInput.value.trim();
  const content = elements.contentInput.value.trim();
  if (!title || !content) {
    showToast("제목과 내용을 모두 입력해 주세요.", "error");
    return;
  }

  setSubmitting(true);
  try {
    const action = state.editorMode === "edit" ? "update" : "create";
    const payload = { title, content };
    if (action === "update") payload.postId = state.currentPost.id;

    const result = await apiRequest(action, payload, true);
    closeDialog(elements.editorDialog);
    state.currentPost = result.post;
    await loadPosts();
    showToast(action === "update" ? "글을 수정했습니다." : "새 글을 등록했습니다.");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setSubmitting(false);
  }
}

async function deleteCurrentPost() {
  if (!state.currentPost?.canEdit) return;
  if (!window.confirm("이 글을 삭제할까요? 삭제 후에는 게시판에서 보이지 않습니다.")) return;

  elements.deleteButton.disabled = true;
  try {
    await apiRequest("delete", { postId: state.currentPost.id }, true);
    closeDialog(elements.detailDialog);
    state.currentPost = null;
    await loadPosts();
    showToast("글을 삭제했습니다.");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    elements.deleteButton.disabled = false;
  }
}

async function apiRequest(action, payload = {}, includeCredential = true) {
  const requestBody = { action, ...payload };
  if (includeCredential && state.credential) requestBody.credential = state.credential;

  let response;
  try {
    response = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(requestBody),
      redirect: "follow",
    });
  } catch (error) {
    throw new Error("서버에 연결할 수 없습니다. 인터넷 연결과 Apps Script 주소를 확인해 주세요.");
  }

  if (!response.ok) throw new Error(`서버 요청에 실패했습니다. (${response.status})`);

  let result;
  try {
    result = await response.json();
  } catch (error) {
    throw new Error("서버 응답을 해석하지 못했습니다. Apps Script 배포 설정을 확인해 주세요.");
  }

  if (!result.ok) {
    const code = result.error?.code || "REQUEST_FAILED";
    if (["AUTH_REQUIRED", "INVALID_TOKEN", "TOKEN_EXPIRED"].includes(code)) {
      clearSession();
      renderAuthState();
    }
    const requestError = new Error(result.error?.message || "요청을 처리하지 못했습니다.");
    requestError.code = code;
    throw requestError;
  }

  return result.data || {};
}

function isAuthError(error) {
  return ["AUTH_REQUIRED", "INVALID_TOKEN", "TOKEN_EXPIRED"].includes(error?.code);
}

function setBoardState(view) {
  elements.loadingState.hidden = view !== "loading";
  elements.errorState.hidden = view !== "error";
  elements.emptyState.hidden = view !== "empty";
  elements.postList.hidden = view !== "list";
}

function setSubmitting(isSubmitting) {
  elements.submitButton.disabled = isSubmitting;
  elements.submitButton.textContent = isSubmitting
    ? "저장 중..."
    : state.editorMode === "edit"
      ? "수정 완료"
      : "등록하기";
}

function updateCharacterCounts() {
  elements.titleCount.textContent = String(elements.titleInput.value.length);
  elements.contentCount.textContent = String(elements.contentInput.value.length);
}

function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
}

function formatDate(value, includeTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "날짜 없음";

  const options = includeTime
    ? { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }
    : { year: "numeric", month: "short", day: "numeric" };
  return new Intl.DateTimeFormat("ko-KR", options).format(date);
}

function showToast(message, type = "success") {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.className = `toast${type === "error" ? " error" : ""}`;
  elements.toast.hidden = false;
  state.toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 3400);
}
