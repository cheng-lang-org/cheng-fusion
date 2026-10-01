export {};

declare const t: {
  pubProduct_productNamePh: string;
  pubProduct_productDescPh: string;
};

export function PublishProductWizard(): unknown {
  return (
    <div>
      <input type="text" placeholder={t.pubProduct_productNamePh} />
      <textarea placeholder={t.pubProduct_productDescPh} />
      <input type="number" placeholder="0.00" />
    </div>
  );
}
