export {};

declare const isPublishing: boolean;
declare const t: {
  common_loading: string;
  pub_publish: string;
  pubProduct_csvMode: string;
};

export function PublishProductPage(): unknown {
  return (
    <div>
      <button>{t.pubProduct_csvMode}</button>
      <select aria-label="product-source-mode">
        <option>授权商品源</option>
      </select>
      <button>{isPublishing ? t.common_loading : t.pub_publish}</button>
    </div>
  );
}
