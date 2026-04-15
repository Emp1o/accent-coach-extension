chrome.runtime.sendMessage({ type: 'OPEN_TRAINING_SESSION', mode: 'all', count: 10 }).then(() => window.close()).catch(() => {});
