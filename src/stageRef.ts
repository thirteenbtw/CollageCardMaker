import type Konva from 'konva'

/** The live editor stage, used by export and thumbnail rendering. */
export const stageRef: { current: Konva.Stage | null } = { current: null }

export const ASSET_MIME = 'application/x-card-asset'
