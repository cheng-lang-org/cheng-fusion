export {};

declare const isPurchased: boolean;

export function EcomProductDetailPage(): unknown {
  return (
    <div>
      <button>加入购物车</button>
      <button>{isPurchased ? '已购买' : '立即购买'}</button>
    </div>
  );
}
