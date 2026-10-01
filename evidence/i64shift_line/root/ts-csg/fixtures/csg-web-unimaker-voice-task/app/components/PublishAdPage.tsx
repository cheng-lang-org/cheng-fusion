export {};

declare const coverInputRef: unknown;
declare const isPublishing: boolean;
declare const t: {
  common_loading: string;
  pub_publish: string;
  pub_title: string;
  pub_description: string;
};

export function PublishAdPage(): unknown {
  return (
    <div>
      <input type="file" ref={coverInputRef} onChange="handleCoverSelect" accept="image/*,video/*" />
      <input type="text" placeholder={t.pub_title} />
      <textarea placeholder={t.pub_description} />
      <button>{isPublishing ? t.common_loading : t.pub_publish}</button>
    </div>
  );
}
