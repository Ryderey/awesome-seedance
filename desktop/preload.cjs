const { contextBridge, ipcRenderer } = require('electron');
const methods = ['overview', 'search', 'cancelSearch', 'detail', 'getSettings', 'saveSettings', 'testConnection', 'copy', 'openLink', 'refresh'];
const bridge = Object.fromEntries(methods.map(name => [name, value => ipcRenderer.invoke(`library:${name}`, value)]));
bridge.onSearch = callback => {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on('library:search-event', listener);
  return () => ipcRenderer.removeListener('library:search-event', listener);
};
contextBridge.exposeInMainWorld('library', bridge);
