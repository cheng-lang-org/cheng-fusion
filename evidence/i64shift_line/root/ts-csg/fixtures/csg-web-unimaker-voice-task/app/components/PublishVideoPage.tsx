export {};

declare const fileInputRef: unknown;
declare const isPublishing: boolean;
declare const t: {
  common_loading: string;
  pub_publish: string;
  pub_title: string;
  pubContent_sharePlaceholder: string;
};

export function PublishVideoPage(): unknown {
  return (
    <div>
      <input type="file" ref={fileInputRef} onChange="handleFileSelect" accept="video/*" />
      <input type="text" placeholder={t.pub_title} />
      <textarea placeholder={t.pubContent_sharePlaceholder} />
      <button>{isPublishing ? t.common_loading : t.pub_publish}</button>
    </div>
  );
}
