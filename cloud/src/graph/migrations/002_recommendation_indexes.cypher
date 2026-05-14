// 002_recommendation_indexes — relationship indexes for hot read paths.
// Neo4j 5+ supports relationship property indexes.

CREATE INDEX rel_viewed_at IF NOT EXISTS FOR ()-[r:VIEWED]-() ON (r.at);
CREATE INDEX rel_intent_strength IF NOT EXISTS FOR ()-[r:HAS_INTENT]-() ON (r.strength);
CREATE INDEX rel_mentions_confidence IF NOT EXISTS FOR ()-[r:MENTIONS]-() ON (r.confidence);
