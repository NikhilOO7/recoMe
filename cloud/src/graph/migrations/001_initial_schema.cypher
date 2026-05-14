// 001_initial_schema — uniqueness constraints + lookup indexes.
// All statements are idempotent (IF NOT EXISTS).

CREATE CONSTRAINT user_id IF NOT EXISTS
FOR (u:User) REQUIRE u.id IS UNIQUE;

CREATE CONSTRAINT topic_normalized_name IF NOT EXISTS
FOR (t:Topic) REQUIRE t.normalizedName IS UNIQUE;

CREATE CONSTRAINT entity_id IF NOT EXISTS
FOR (e:Entity) REQUIRE e.id IS UNIQUE;

CREATE CONSTRAINT page_url IF NOT EXISTS
FOR (p:Page) REQUIRE p.url IS UNIQUE;

CREATE CONSTRAINT session_id IF NOT EXISTS
FOR (s:Session) REQUIRE s.id IS UNIQUE;

CREATE CONSTRAINT signal_id IF NOT EXISTS
FOR (sg:Signal) REQUIRE sg.id IS UNIQUE;

CREATE INDEX entity_kind IF NOT EXISTS FOR (e:Entity) ON (e.kind);
CREATE INDEX page_platform IF NOT EXISTS FOR (p:Page) ON (p.platform);
CREATE INDEX topic_name IF NOT EXISTS FOR (t:Topic) ON (t.name);
CREATE INDEX session_user IF NOT EXISTS FOR (s:Session) ON (s.userId);
CREATE INDEX signal_user_ts IF NOT EXISTS FOR (sg:Signal) ON (sg.userId, sg.ts);
