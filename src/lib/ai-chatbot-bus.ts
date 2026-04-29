// Tiny event bus so anywhere in the UI can ask the AI chatbot to open.
const EVT = 'lov:open-ai-chatbot';
export const openAIChatbot = () => window.dispatchEvent(new CustomEvent(EVT));
export const onOpenAIChatbot = (cb: () => void) => {
  const handler = () => cb();
  window.addEventListener(EVT, handler);
  return () => window.removeEventListener(EVT, handler);
};
