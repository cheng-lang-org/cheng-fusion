declare function useState<T>(initial: T): [T, (value: T) => void];

interface StructStateItem {
  name: string;
  score: number;
}

interface StructStateNested {
  enabled: boolean;
  tags: string[];
}

interface StructState {
  title: string;
  count: number;
  nested: StructStateNested;
  pair: ["甲", "乙"];
  items: StructStateItem[];
}

const initialSaved: StructState = {
  title: "旧命盘",
  count: 1,
  nested: {
    enabled: false,
    tags: ["x"],
  },
  pair: ["甲", "乙"],
  items: [
    { name: "old", score: 3 },
  ],
};

export function Component() {
  const [result, setResult] = useState<StructState | null>(null);
  const [saved, setSaved] = useState<StructState>(initialSaved);

  const handleClick = () => {
    const next: StructState = {
      title: "命盘",
      count: 2,
      nested: {
        enabled: true,
        tags: ["a", "b"],
      },
      pair: ["甲", "乙"],
      items: [
        { name: "alpha", score: 7 },
        { name: "beta", score: 9 },
      ],
    };
    setResult(next);
  };

  const handleReadStruct = () => {
    const next: StructState = {
      title: saved.title,
      count: saved.count + 1,
      nested: saved.nested,
      pair: saved.pair,
      items: saved.items,
    };
    setSaved(next);
  };

  return result ? handleReadStruct : handleClick;
}
