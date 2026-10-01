#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>

extern void cheng_mobile_host_runtime_set_launch_args(const char* kv, const char* json);
extern void cheng_mobile_host_begin_offscreen_capture(int w, int h);
extern uint64_t cheng_app_init(void);
extern void cheng_app_set_window(uint64_t app, uint64_t win, int32_t w, int32_t h, float scale);
extern void cheng_app_tick(uint64_t app, float dt);

extern int32_t cheng_app_debug_semantic_route_count(void);
extern const char* cheng_app_debug_semantic_route_id_at(int32_t);
extern int32_t cheng_app_debug_semantic_node_count(void);
extern int32_t cheng_app_debug_semantic_node_route_index_at(int32_t);
extern int32_t cheng_app_debug_semantic_node_id_at(int32_t);
extern int32_t cheng_app_debug_semantic_node_parent_at(int32_t);
extern int32_t cheng_app_debug_semantic_node_kind_at(int32_t);
extern const char* cheng_app_debug_semantic_node_tag_at(int32_t);
extern int32_t cheng_app_debug_semantic_prop_count(void);
extern int32_t cheng_app_debug_semantic_prop_route_index_at(int32_t);
extern int32_t cheng_app_debug_semantic_prop_node_id_at(int32_t);
extern int32_t cheng_app_debug_semantic_prop_ordinal_at(int32_t);
extern const char* cheng_app_debug_semantic_prop_name_at(int32_t);
extern const char* cheng_app_debug_semantic_prop_value_at(int32_t);
extern const char* cheng_app_debug_semantic_prop_value_kind_at(int32_t);
extern int32_t cheng_app_debug_semantic_event_handler_count(void);
extern int32_t cheng_app_debug_semantic_event_handler_route_index_at(int32_t);
extern int32_t cheng_app_debug_semantic_event_handler_node_id_at(int32_t);
extern const char* cheng_app_debug_semantic_event_handler_event_name_at(int32_t);
extern const char* cheng_app_debug_semantic_event_handler_handler_at(int32_t);
extern const char* cheng_app_debug_semantic_event_handler_action_kind_at(int32_t);
extern const char* cheng_app_debug_semantic_event_handler_state_ref_at(int32_t);
extern int32_t cheng_app_debug_semantic_hit_target_count(void);
extern int32_t cheng_app_debug_semantic_hit_target_route_index_at(int32_t);
extern int32_t cheng_app_debug_semantic_hit_target_node_id_at(int32_t);
extern const char* cheng_app_debug_semantic_hit_target_kind_at(int32_t);
extern const char* cheng_app_debug_semantic_hit_target_action_at(int32_t);
extern const char* cheng_app_debug_semantic_hit_target_event_at(int32_t);
extern int32_t cheng_app_debug_semantic_hit_target_route_target_at(int32_t);
extern int32_t cheng_app_debug_semantic_route_edge_count(void);
extern int32_t cheng_app_debug_semantic_route_edge_route_index_at(int32_t);
extern int32_t cheng_app_debug_semantic_route_edge_node_id_at(int32_t);
extern int32_t cheng_app_debug_semantic_route_edge_target_route_index_at(int32_t);
extern int32_t cheng_app_debug_semantic_css_declaration_count(void);
extern int32_t cheng_app_debug_semantic_css_declaration_route_index_at(int32_t);
extern int32_t cheng_app_debug_semantic_css_declaration_node_id_at(int32_t);
extern const char* cheng_app_debug_semantic_css_declaration_property_at(int32_t);
extern const char* cheng_app_debug_semantic_css_declaration_value_at(int32_t);
extern int32_t cheng_app_debug_semantic_layout_constraint_count(void);
extern int32_t cheng_app_debug_semantic_layout_constraint_route_index_at(int32_t);
extern int32_t cheng_app_debug_semantic_layout_constraint_node_id_at(int32_t);
extern const char* cheng_app_debug_semantic_layout_constraint_prop_at(int32_t);
extern const char* cheng_app_debug_semantic_layout_constraint_value_at(int32_t);

static FILE* out;
static void js_str(const char* s){
  if (s == NULL) { fputs("null", out); return; }
  fputc('"', out);
  for (const unsigned char* p=(const unsigned char*)s; *p; p++){
    unsigned char c=*p;
    switch(c){
      case '"': fputs("\\\"", out); break;
      case '\\': fputs("\\\\", out); break;
      case '\n': fputs("\\n", out); break;
      case '\r': fputs("\\r", out); break;
      case '\t': fputs("\\t", out); break;
      default:
        if (c < 0x20) fprintf(out, "\\u%04x", c);
        else fputc(c, out);
    }
  }
  fputc('"', out);
}

int main(int argc, char** argv){
  const char* path = argc > 1 ? argv[1] : "/data/local/tmp/cheng_semantic_manifest.json";
  out = fopen(path, "w");
  if (out == NULL) { fprintf(stderr, "open failed %s\n", path); return 2; }
  cheng_mobile_host_runtime_set_launch_args("route_state=home_default\nroute_lock=1\n","");
  cheng_mobile_host_begin_offscreen_capture(390,844);
  uint64_t app = cheng_app_init();
  cheng_app_set_window(app,1,390,844,1.0f);
  for(int i=0;i<3;i++) cheng_app_tick(app,0.016667f);

  fputs("{\"schema\":\"unimaker.scene_manifest.v1\",", out);
  fputs("\"source\":\"cheng.scene_graph\",", out);
  int nr = cheng_app_debug_semantic_route_count();
  fprintf(out, "\"routes\":[");
  for(int i=0;i<nr;i++){
    if(i) fputc(',', out);
    fputc('{', out); fprintf(out,"\"route_index\":%d,",i); fputs("\"route_id\":",out); js_str(cheng_app_debug_semantic_route_id_at(i)); fputc('}', out);
  }
  fputs("],", out);

  int nn = cheng_app_debug_semantic_node_count();
  fprintf(out, "\"nodes\":[");
  for(int i=0;i<nn;i++){
    if(i) fputc(',', out);
    fprintf(out,"{\"index\":%d,\"route_index\":%d,\"node_id\":%d,\"parent_node_id\":%d,\"kind\":%d,\"tag\":",i,
      cheng_app_debug_semantic_node_route_index_at(i), cheng_app_debug_semantic_node_id_at(i),
      cheng_app_debug_semantic_node_parent_at(i), cheng_app_debug_semantic_node_kind_at(i));
    js_str(cheng_app_debug_semantic_node_tag_at(i)); fputc('}', out);
  }
  fputs("],", out);

  int np = cheng_app_debug_semantic_prop_count();
  fprintf(out, "\"props\":[");
  for(int i=0;i<np;i++){
    if(i) fputc(',', out);
    fprintf(out,"{\"index\":%d,\"route_index\":%d,\"node_id\":%d,\"ordinal\":%d,\"name\":",i,
      cheng_app_debug_semantic_prop_route_index_at(i), cheng_app_debug_semantic_prop_node_id_at(i),
      cheng_app_debug_semantic_prop_ordinal_at(i));
    js_str(cheng_app_debug_semantic_prop_name_at(i)); fputs(",\"value\":",out); js_str(cheng_app_debug_semantic_prop_value_at(i));
    fputs(",\"kind\":",out); js_str(cheng_app_debug_semantic_prop_value_kind_at(i)); fputc('}', out);
  }
  fputs("],", out);

  int nh = cheng_app_debug_semantic_event_handler_count();
  fprintf(out, "\"event_handlers\":[");
  for(int i=0;i<nh;i++){
    if(i) fputc(',', out);
    fprintf(out,"{\"index\":%d,\"route_index\":%d,\"node_id\":%d,\"event\":",i,
      cheng_app_debug_semantic_event_handler_route_index_at(i), cheng_app_debug_semantic_event_handler_node_id_at(i));
    js_str(cheng_app_debug_semantic_event_handler_event_name_at(i)); fputs(",\"handler\":",out); js_str(cheng_app_debug_semantic_event_handler_handler_at(i));
    fputs(",\"action\":",out); js_str(cheng_app_debug_semantic_event_handler_action_kind_at(i));
    fputs(",\"state_ref\":",out); js_str(cheng_app_debug_semantic_event_handler_state_ref_at(i)); fputc('}', out);
  }
  fputs("],", out);

  int nt = cheng_app_debug_semantic_hit_target_count();
  fprintf(out, "\"hit_targets\":[");
  for(int i=0;i<nt;i++){
    if(i) fputc(',', out);
    fprintf(out,"{\"index\":%d,\"route_index\":%d,\"node_id\":%d,\"kind\":",i,
      cheng_app_debug_semantic_hit_target_route_index_at(i), cheng_app_debug_semantic_hit_target_node_id_at(i));
    js_str(cheng_app_debug_semantic_hit_target_kind_at(i)); fputs(",\"action\":",out); js_str(cheng_app_debug_semantic_hit_target_action_at(i));
    fputs(",\"event\":",out); js_str(cheng_app_debug_semantic_hit_target_event_at(i));
    fprintf(out,",\"target_route_index\":%d}", cheng_app_debug_semantic_hit_target_route_target_at(i));
  }
  fputs("],", out);

  int ne = cheng_app_debug_semantic_route_edge_count();
  fprintf(out, "\"route_edges\":[");
  for(int i=0;i<ne;i++){
    if(i) fputc(',', out);
    fprintf(out,"{\"index\":%d,\"route_index\":%d,\"node_id\":%d,\"target_route_index\":%d}", i,
      cheng_app_debug_semantic_route_edge_route_index_at(i), cheng_app_debug_semantic_route_edge_node_id_at(i),
      cheng_app_debug_semantic_route_edge_target_route_index_at(i));
  }
  fputs("],", out);

  int nc = cheng_app_debug_semantic_css_declaration_count();
  fprintf(out, "\"css_declarations\":[");
  for(int i=0;i<nc;i++){
    if(i) fputc(',', out);
    fprintf(out,"{\"index\":%d,\"route_index\":%d,\"node_id\":%d,\"property\":", i,
      cheng_app_debug_semantic_css_declaration_route_index_at(i), cheng_app_debug_semantic_css_declaration_node_id_at(i));
    js_str(cheng_app_debug_semantic_css_declaration_property_at(i)); fputs(",\"value\":",out); js_str(cheng_app_debug_semantic_css_declaration_value_at(i)); fputc('}', out);
  }
  fputs("],", out);

  int nl = cheng_app_debug_semantic_layout_constraint_count();
  fprintf(out, "\"layout_constraints\":[");
  for(int i=0;i<nl;i++){
    if(i) fputc(',', out);
    fprintf(out,"{\"index\":%d,\"route_index\":%d,\"node_id\":%d,\"property\":", i,
      cheng_app_debug_semantic_layout_constraint_route_index_at(i), cheng_app_debug_semantic_layout_constraint_node_id_at(i));
    js_str(cheng_app_debug_semantic_layout_constraint_prop_at(i)); fputs(",\"value\":",out); js_str(cheng_app_debug_semantic_layout_constraint_value_at(i)); fputc('}', out);
  }
  fputs("],", out);

  fprintf(out,"\"counts\":{\"routes\":%d,\"nodes\":%d,\"props\":%d,\"event_handlers\":%d,\"hit_targets\":%d,\"route_edges\":%d,\"css_declarations\":%d,\"layout_constraints\":%d}}",
    nr,nn,np,nh,nt,ne,nc,nl);
  fputc('\n', out);
  fclose(out);
  fprintf(stderr,"manifest written %s routes=%d nodes=%d props=%d handlers=%d hit_targets=%d edges=%d css_decls=%d layouts=%d\n", path,nr,nn,np,nh,nt,ne,nc,nl);
  return 0;
}
