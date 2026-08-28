const requestedId=new URLSearchParams(globalThis.location.search).get('id');
const target=requestedId?`index.html?id=${encodeURIComponent(requestedId)}#objects`:'index.html#objects';
globalThis.location.replace(target);
