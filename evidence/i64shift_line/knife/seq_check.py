import io
seq = io.open('/tmp/i64s_seq/bootstrap/cold_parser.c', encoding='utf-8').read()
knife = io.open('/Users/lbcheng/cheng-lang/.rebuild/i64shift_line/knife/cold_parser.c.new', encoding='utf-8').read()
subs = [
 ("   @borrow_result call (`let view = SliceView(root.bufField, ...)`) between",
  "   a @borrow_result call (`let view = SliceView(root.bufField, ...)`) between"),
 ("   @borrows effect and stay rooted by a BorrowShared projection.  A PLAIN",
  "   the @borrows effect and stay rooted by a BorrowShared projection.  A PLAIN"),
 ("           @borrow_result store establishes a fresh activation whose",
  "           a @borrow_result store establishes a fresh activation whose"),
 ("       @borrow_result call may safely derive a shared result from that unique",
  "       a @borrow_result call may safely derive a shared result from that unique"),
 ("   @borrow_result contract may additionally name this same immutable row as",
  "   a @borrow_result contract may additionally name this same immutable row as"),
]
for old, new in subs:
    assert knife.count(old) == 1
    knife = knife.replace(old, new)
print("SEQ_EQ_COMBINED =", seq == knife)
