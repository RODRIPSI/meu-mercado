// Canal simples para devolver o código lido pela câmera à tela que abriu o scanner.
let handler: ((code: string) => void) | null = null;
export const setScanHandler = (fn: ((code: string) => void) | null) => { handler = fn; };
export const emitScan = (code: string) => { handler?.(code); };
