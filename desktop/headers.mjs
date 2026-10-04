const protectedNames = new Set([
  'authorization', 'proxy-authorization', 'host', 'content-length', 'content-type',
  'connection', 'keep-alive', 'proxy-authenticate', 'te', 'trailer', 'transfer-encoding', 'upgrade',
]);
const token = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

// Shared by the renderer and main process. Error messages never include header values.
export function validateHeaders(input) {
  if (!Array.isArray(input) || input.length > 20) return { rows: [], errors: [], message: '自定义请求头必须为列表，最多 20 条' };
  const errors = input.map(() => '');
  const names = new Map();
  const rows = input.map((source, index) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      errors[index] = '请求头配置格式无效';
      return { name: '', value: '', valueType: 'fixed', enabled: true, remember: false };
    }
    const { name = '', value = '', valueType = 'fixed', enabled = true, remember = false } = source;
    if (typeof name !== 'string' || name.length > 128 || typeof value !== 'string' || value.length > 8192 ||
        !['fixed', 'session'].includes(valueType) || typeof enabled !== 'boolean' || typeof remember !== 'boolean') {
      errors[index] = '配置类型无效，名称最多 128 字符，值最多 8192 字符';
      return { name: typeof name === 'string' ? name.slice(0, 128) : '', value: '', valueType: 'fixed', enabled: false, remember: false };
    }
    const row = { name: name.trim(), value: valueType === 'session' ? '' : value, valueType, enabled, remember };
    if (!enabled) return row;
    if (!token.test(row.name) || /[\r\n]/.test(name)) errors[index] = '名称只能包含英文字母、数字及合法 HTTP 标点，不能为空';
    else if (protectedNames.has(row.name.toLowerCase())) errors[index] = '此请求头由应用管理；认证请使用 API Key';
    else if (valueType === 'fixed' && (!value.trim() || /[^\x20-\x7e]/.test(value))) errors[index] = '固定值不能为空，且只能包含可打印的 ASCII 字符';
    const key = row.name.toLowerCase();
    if (key && names.has(key)) {
      errors[index] = '启用的请求头名称不能重复（不区分大小写）';
      errors[names.get(key)] = errors[index];
    } else if (key) names.set(key, index);
    return row;
  });
  return { rows, errors, message: '' };
}
