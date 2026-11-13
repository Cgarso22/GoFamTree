"""Load the export from the Claude family-tree app into Supabase as one SQL file.

Usage:  python3 scripts/build_import_sql.py data-export OWNER_EMAIL > supabase/import.sql
Run schema.sql first; the owner must already have signed up on the site.
"""
import json, sys, pathlib
src = pathlib.Path(sys.argv[1]); owner = sys.argv[2]
q = lambda v: "'" + str(v).replace("'", "''") + "'"
out = ["begin;",
       f"insert into families(name, owner_id) select 'Garson Family', id from auth.users where email = {q(owner)} limit 1;",
       "create temp table fam on commit drop as select id from families order by created_at desc limit 1;"]
n = 0
for coll in ('people', 'unions', 'contacts', 'hiddencontacts'):
    d = src / coll
    if not d.exists(): continue
    for f in sorted(d.glob('*.json')):
        doc = json.loads(f.read_text()); data = doc.get('data', doc)
        target = 'hiddencontacts' if coll == 'contacts' else coll   # contact details start out private
        out.append(f"insert into family_docs(family_id, collection, doc_id, data) select id, {q(target)}, {q(doc.get('id', f.stem))}, {q(json.dumps(data))}::jsonb from fam;")
        n += 1
out.append("update family_members set person_id = 'chad-garson' where family_id = (select id from fam) and role = 'owner';")
out.append("commit;")
print("\n".join(out))
print(f"-- {n} documents", file=sys.stderr)
