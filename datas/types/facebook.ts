interface FacebookLeftPannelDescription {
    require: FacebookLeftPannelDescriptionRequire[]
}

interface FacebookLeftPannelDescriptionRequire {
    0: string
    1: string
    2: string[]
    3: { 
        '__bbox': {
            require?: FacebookLeftPannelDescriptionBboxRequire[]
        }
    }[]
}

interface FacebookLeftPannelDescriptionBboxRequire {
    0: string
    1: string
    2: string[]
    3: {
        0: string,
        1: FacebookLeftPannelDescriptionProfileSection
    }
}

interface FacebookLeftPannelDescriptionProfileSection {
    __bbox: {
        result: {
            data: {
                profile_tile_sections: { edges: FacebookLeftPannelDescriptionProfileNode[] }
            }
        }
    }
}

interface FacebookLeftPannelDescriptionProfileNode {
    node: {
        profile_tile_section_type: string
        profile_tile_views: { nodes: FacebookLeftPannelDescriptionProfileNodeInfo[] }
    }
}

interface FacebookLeftPannelDescriptionProfileNodeInfo {
    view_style_renderer?: {
        view: {
            profile_tile_items: { nodes: FacebookLeftPannelDescriptionProfileNodeDetail[] }
        }
    }
}

interface FacebookLeftPannelDescriptionProfileNodeDetail {
    node: {
        profile_status_text?: { text: string }
        timeline_context_item?: {
            renderer: {
                context_item: {
                    title: { text: string }
                }
            }
        }
    }
}

export type { FacebookLeftPannelDescription }