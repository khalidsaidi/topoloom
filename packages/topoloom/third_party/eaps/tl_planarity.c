#include <stdlib.h>
#include <string.h>

#include "graphLib/graphLib.h"

static graphP g_graph = NULL;
static int *g_edgeIdByArc = NULL;
static int g_edgeIdByArcSize = 0;
static int g_vertexCount = 0;
static int g_edgeCount = 0;
static int g_lastEmbedResult = 0;

static void tl_clear_state(void) {
    if (g_graph != NULL) {
        gp_Free(&g_graph);
        g_graph = NULL;
    }
    if (g_edgeIdByArc != NULL) {
        free(g_edgeIdByArc);
        g_edgeIdByArc = NULL;
    }
    g_edgeIdByArcSize = 0;
    g_vertexCount = 0;
    g_edgeCount = 0;
    g_lastEmbedResult = 0;
}

int tl_planarity_run(int n, int m, const int *u, const int *v, int embedFlags) {
    tl_clear_state();

    if (n <= 0) return NOTOK;
    if (m < 0) return NOTOK;

    g_vertexCount = n;
    g_edgeCount = m;

    g_graph = gp_New();
    if (g_graph == NULL) return NOTOK;

    // Ensure sufficient arc capacity for all edges before initialization
    // Use at least 6 * N arcs to satisfy internal stack sizing expectations.
    int requiredArcs = (m * 2) + 4;
    int minArcs = 6 * n;
    if (requiredArcs < minArcs) requiredArcs = minArcs;
    if (gp_EnsureArcCapacity(g_graph, requiredArcs) != OK) return NOTOK;
    if (gp_InitGraph(g_graph, n) != OK) return NOTOK;

    g_edgeIdByArcSize = gp_EdgeIndexBound(g_graph);
    g_edgeIdByArc = (int *)malloc(sizeof(int) * g_edgeIdByArcSize);
    if (g_edgeIdByArc == NULL) return NOTOK;
    for (int i = 0; i < g_edgeIdByArcSize; i++) g_edgeIdByArc[i] = -1;

    for (int i = 0; i < m; i++) {
        if (gp_AddEdge(g_graph, u[i], 0, v[i], 0) != OK) {
            g_lastEmbedResult = NOTOK;
            return g_lastEmbedResult;
        }
    }

    // Build arc -> edgeId mapping by matching endpoints.
    int edgeBound = gp_EdgeInUseIndexBound(g_graph);
    unsigned char *edgeUsed = (unsigned char *)calloc((size_t)g_edgeCount, sizeof(unsigned char));
    if (edgeUsed == NULL) return NOTOK;
    for (int arc = gp_GetFirstEdge(g_graph); arc < edgeBound; arc++) {
        if (!gp_EdgeInUse(g_graph, arc)) continue;
        int twinArc = gp_GetTwinArc(g_graph, arc);
        if (twinArc < arc) continue; // process each edge once
        int uArc = gp_GetNeighbor(g_graph, twinArc);
        int vArc = gp_GetNeighbor(g_graph, arc);
        int match = -1;
        for (int e = 0; e < g_edgeCount; e++) {
            if (edgeUsed[e]) continue;
            int ue = u[e];
            int ve = v[e];
            if ((ue == uArc && ve == vArc) || (ue == vArc && ve == uArc)) {
                match = e;
                edgeUsed[e] = 1;
                break;
            }
        }
        if (match >= 0) {
            if (arc >= 0 && arc < g_edgeIdByArcSize) g_edgeIdByArc[arc] = match;
            if (twinArc >= 0 && twinArc < g_edgeIdByArcSize) g_edgeIdByArc[twinArc] = match;
        }
    }
    free(edgeUsed);

    g_lastEmbedResult = gp_Embed(g_graph, embedFlags);
    if (g_lastEmbedResult == OK || g_lastEmbedResult == NONEMBEDDABLE) {
        // Restore original vertex numbering so neighbor values match input IDs.
        gp_SortVertices(g_graph);
    }
    return g_lastEmbedResult;
}

int tl_planarity_rotation_size(void) {
    if (g_graph == NULL || g_lastEmbedResult != OK) return 0;
    int total = 0;
    for (int v = 0; v < g_vertexCount; v++) {
        for (int arc = gp_GetFirstArc(g_graph, v); gp_IsArc(arc); arc = gp_GetNextArc(g_graph, arc)) {
            total++;
        }
    }
    return total;
}

void tl_planarity_write_rotation(int *offsets, int *edgeIds, int *neighbors) {
    if (g_graph == NULL || g_lastEmbedResult != OK) return;
    int cursor = 0;
    for (int v = 0; v < g_vertexCount; v++) {
        offsets[v] = cursor;
        for (int arc = gp_GetFirstArc(g_graph, v); gp_IsArc(arc); arc = gp_GetNextArc(g_graph, arc)) {
            int edgeId = (arc >= 0 && arc < g_edgeIdByArcSize) ? g_edgeIdByArc[arc] : -1;
            edgeIds[cursor] = edgeId;
            neighbors[cursor] = gp_GetNeighbor(g_graph, arc);
            cursor++;
        }
    }
    offsets[g_vertexCount] = cursor;
}

int tl_planarity_witness_edge_count(void) {
    if (g_graph == NULL || g_lastEmbedResult != NONEMBEDDABLE) return 0;
    int count = 0;
    unsigned char *seen = (unsigned char *)calloc((size_t)g_edgeCount, sizeof(unsigned char));
    if (seen == NULL) return 0;

    int edgeBound = gp_EdgeInUseIndexBound(g_graph);
    for (int arc = gp_GetFirstEdge(g_graph); arc < edgeBound; arc++) {
        if (!gp_EdgeInUse(g_graph, arc)) continue;
        int edgeId = (arc >= 0 && arc < g_edgeIdByArcSize) ? g_edgeIdByArc[arc] : -1;
        if (edgeId >= 0 && edgeId < g_edgeCount && !seen[edgeId]) {
            seen[edgeId] = 1;
            count++;
        }
    }
    free(seen);
    return count;
}

void tl_planarity_write_witness_edges(int *edgeIds) {
    if (g_graph == NULL || g_lastEmbedResult != NONEMBEDDABLE) return;
    unsigned char *seen = (unsigned char *)calloc((size_t)g_edgeCount, sizeof(unsigned char));
    if (seen == NULL) return;

    int cursor = 0;
    int edgeBound = gp_EdgeInUseIndexBound(g_graph);
    for (int arc = gp_GetFirstEdge(g_graph); arc < edgeBound; arc++) {
        if (!gp_EdgeInUse(g_graph, arc)) continue;
        int edgeId = (arc >= 0 && arc < g_edgeIdByArcSize) ? g_edgeIdByArc[arc] : -1;
        if (edgeId >= 0 && edgeId < g_edgeCount && !seen[edgeId]) {
            seen[edgeId] = 1;
            edgeIds[cursor++] = edgeId;
        }
    }
    free(seen);
}

int tl_planarity_witness_vertex_count(void) {
    if (g_graph == NULL || g_lastEmbedResult != NONEMBEDDABLE) return 0;
    int count = 0;
    for (int v = 0; v < g_vertexCount; v++) {
        if (gp_VirtualVertexInUse(g_graph, v)) count++;
    }
    return count;
}

void tl_planarity_write_witness_vertices(int *vertexIds) {
    if (g_graph == NULL || g_lastEmbedResult != NONEMBEDDABLE) return;
    int cursor = 0;
    for (int v = 0; v < g_vertexCount; v++) {
        if (gp_VirtualVertexInUse(g_graph, v)) {
            vertexIds[cursor++] = v;
        }
    }
}

int tl_planarity_witness_type(void) {
    if (g_graph == NULL || g_lastEmbedResult != NONEMBEDDABLE) return 0;
    int minorType = g_graph->IC.minorType;
    int k33Mask = MINORTYPE_A | MINORTYPE_B | MINORTYPE_C | MINORTYPE_D | MINORTYPE_E1 | MINORTYPE_E2 | MINORTYPE_E3 | MINORTYPE_E4;
    if (minorType & k33Mask) return 33;
    if (minorType & MINORTYPE_E) return 5;
    return 0;
}

void tl_planarity_free(void) {
    tl_clear_state();
}
