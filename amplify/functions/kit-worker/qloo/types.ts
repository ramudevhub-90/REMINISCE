export interface QlooTag {
  id: string;
  name: string;
  type?: string;
}

export interface QlooEntity {
  entity_id: string;
  name: string;
  type: string;
  popularity?: number;
  query?: { affinity?: number };
  tags?: QlooTag[];
  properties?: { release_year?: number; address?: string };
}

export interface QlooResult {
  entities: QlooEntity[];
  tags?: QlooTag[];
  source: "sample" | "live";
  request: string;
  cached?: boolean;
}
