/*
 * Mission posting helpers.
 *
 * A CoT is filed into a DataSync mission by setting `properties.dest` before
 * sendCOT — TAK files it on ingest (the atomic approach the sample plugin calls
 * "same as CloudTAK ETL"). v1 files at mission ROOT (empty path), which avoids
 * the folder-create/attachFeatures race the sample has to retry around. A named
 * "WMD Hazard" folder can be added later via mission.layer.create/attachFeatures.
 */

export interface MissionDest {
  'mission-guid': string;
  path: string;
  after: string;
}

/** Clone a feature with a mission dest so TAK files it on ingest. */
export function withMissionDest<T extends { properties: Record<string, unknown> }>(
  feat: T, missionGuid: string, folderUid = '',
): T {
  const wire = JSON.parse(JSON.stringify(feat)) as T;
  wire.properties.dest = [{ 'mission-guid': missionGuid, path: folderUid, after: '' }] as MissionDest[];
  return wire;
}
