import type { Express } from "express";
import swaggerUi from "swagger-ui-express";

export function setupSwagger(app: Express) {
  const spec = {
    openapi: "3.0.0",
    info: {
      title: "UCG Notifier API",
      version: "1.0.0",
    },
    servers: [
      {
        url: "https://ucg.oracle.makogai.me",
      },
      {
        url: "http://127.0.0.1:3000",
      },
    ],
    tags: [
      { name: "Faculties", description: "Faculty-related endpoints" },
      { name: "Programs", description: "Program-related endpoints" },
      { name: "Posts", description: "Scraped posts (faculty-level and program/subject links)" },
    ],
    paths: {
      "/faculties": {
        get: {
          tags: ["Faculties"],
          summary: "List faculties",
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      items: { type: "array", items: { $ref: "#/components/schemas/Faculty" } },
                    },
                  },
                },
              },
            },
          },
        },
      },

      "/faculties/{id}/staff": {
        get: {
          tags: ["Faculties"],
          summary: "List staff for a faculty",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "integer" },
            },
            {
              name: "category",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      faculty: { $ref: "#/components/schemas/Faculty" },
                      items: {
                        type: "array",
                        items: { $ref: "#/components/schemas/FacultyStaff" },
                      },
                    },
                  },
                },
              },
            },
            400: { description: "Invalid faculty id" },
            404: { description: "Faculty not found" },
          },
        },
      },

      "/faculties/{id}/programs": {
        get: {
          tags: ["Faculties"],
          summary: "List programs for a faculty",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: {
              description: "OK",
            },
          },
        },
      },

      "/faculties/{id}/posts": {
        get: {
          tags: ["Posts"],
          summary: "List faculty-level posts (optionally filter by section)",
          description:
            "Returns posts with `facultyId` set (scraped from faculty news sections). Optional `section` is an exact match on `Post.section` (e.g. Obavještenja, Vijesti).",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
            {
              name: "section",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Exact section label as stored when scraped",
            },
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer", default: 200, minimum: 1, maximum: 500 },
            },
            {
              name: "offset",
              in: "query",
              required: false,
              schema: { type: "integer", default: 0, minimum: 0 },
            },
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      faculty: { $ref: "#/components/schemas/Faculty" },
                      items: { type: "array", items: { $ref: "#/components/schemas/Post" } },
                    },
                  },
                },
              },
            },
            400: { description: "Invalid faculty id" },
            404: { description: "Faculty not found" },
          },
        },
      },

      "/posts": {
        get: {
          tags: ["Posts"],
          summary: "List faculty posts by query (same as /faculties/{id}/posts)",
          parameters: [
            {
              name: "facultyId",
              in: "query",
              required: true,
              schema: { type: "integer" },
            },
            {
              name: "section",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer", default: 200, minimum: 1, maximum: 500 },
            },
            {
              name: "offset",
              in: "query",
              required: false,
              schema: { type: "integer", default: 0, minimum: 0 },
            },
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      faculty: { $ref: "#/components/schemas/Faculty" },
                      items: { type: "array", items: { $ref: "#/components/schemas/Post" } },
                    },
                  },
                },
              },
            },
            400: { description: "Missing or invalid facultyId" },
            404: { description: "Faculty not found" },
          },
        },
      },

      "/programs/{id}/subjects": {
        get: {
          tags: ["Programs"],
          summary: "List subjects for a program",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
      "/programs/{id}/posts": {
        get: {
          tags: ["Programs"],
          summary: "List posts for a program",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
            {
              name: "semester",
              in: "query",
              required: false,
              schema: { type: "integer" },
            },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
      "/subjects/{id}/posts": {
        get: {
          tags: ["Programs"],
          summary: "List posts for a subject",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: { 200: { description: "OK" } },
        },
      },

      "/professors/{id}": {
        get: {
          tags: ["Faculties"],
          summary: "Get full professor details",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      professor: { $ref: "#/components/schemas/Professor" },
                      teachings: {
                        type: "array",
                        items: { $ref: "#/components/schemas/ProfessorTeaching" },
                      },
                      selectedPublications: {
                        type: "array",
                        items: {
                          $ref: "#/components/schemas/ProfessorSelectedPublication",
                        },
                      },
                      academicContributions: {
                        type: "array",
                        items: {
                          $ref: "#/components/schemas/ProfessorAcademicContribution",
                        },
                      },
                    },
                  },
                },
              },
            },
            400: { description: "Invalid professor id" },
            404: { description: "Professor not found" },
          },
        },
      },

      "/professors/by-profile": {
        get: {
          tags: ["Faculties"],
          summary: "Get full professor details by profileUrl",
          parameters: [
            {
              name: "profileUrl",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: "OK",
            },
            400: { description: "Missing/invalid profileUrl" },
            404: { description: "Professor not found" },
          },
        },
      },
    },
    components: {
      schemas: {
        Faculty: {
          type: "object",
          properties: {
            id: { type: "integer" },
            name: { type: "string" },
            shortCode: { type: "string" },
            url: { type: "string" },
            logoUrl: { type: "string" },
          },
        },
        Post: {
          type: "object",
          properties: {
            id: { type: "integer" },
            title: { type: "string" },
            content: { type: "string", nullable: true },
            contentHtml: { type: "string", nullable: true },
            section: { type: "string", nullable: true },
            url: { type: "string" },
            publishedAt: { type: "string", format: "date-time", nullable: true },
            hash: { type: "string" },
            facultyId: { type: "integer", nullable: true },
            subjectId: { type: "integer", nullable: true },
            programId: { type: "integer", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },

        FacultyStaff: {
          type: "object",
          properties: {
            id: { type: "integer" },
            professorId: { type: "integer" },
            profileUrl: { type: "string" },
            name: { type: "string" },
            email: { type: "string", nullable: true },
            position: { type: "string", nullable: true },
            category: { type: "string", nullable: true },
            avatarUrl: { type: "string", nullable: true },
          },
        },

        Professor: {
          type: "object",
          properties: {
            id: { type: "integer" },
            profileUrl: { type: "string" },
            name: { type: "string" },
            email: { type: "string", nullable: true },
            avatarUrl: { type: "string", nullable: true },
            biographyHtml: { type: "string", nullable: true },
            biographyText: { type: "string", nullable: true },
            biographyUpdatedAt: { type: "string", nullable: true },
          },
        },

        ProfessorTeaching: {
          type: "object",
          properties: {
            id: { type: "integer" },
            professorId: { type: "integer" },
            subjectId: { type: "integer", nullable: true },
            unit: { type: "string", nullable: true },
            programName: { type: "string", nullable: true },
            programType: { type: "string", nullable: true },
            semester: { type: "integer", nullable: true },
            subjectName: { type: "string", nullable: true },
            subjectCode: { type: "string", nullable: true },
            pXgp: { type: "number", nullable: true },
            vXgv: { type: "number", nullable: true },
            lXgl: { type: "number", nullable: true },
          },
        },

        ProfessorSelectedPublication: {
          type: "object",
          properties: {
            id: { type: "integer" },
            professorId: { type: "integer" },
            year: { type: "integer", nullable: true },
            category: { type: "string", nullable: true },
            authors: { type: "string", nullable: true },
            title: { type: "string", nullable: true },
            source: { type: "string", nullable: true },
            url: { type: "string", nullable: true },
          },
        },

        ProfessorAcademicContribution: {
          type: "object",
          properties: {
            id: { type: "integer" },
            professorId: { type: "integer" },
            contributionGroup: { type: "string", nullable: true },
            bibliographicValue: { type: "string", nullable: true },
            year: { type: "integer", nullable: true },
            ucgAuthors: { type: "string", nullable: true },
            details: { type: "string", nullable: true },
          },
        },
      },
    },
  };

  app.use("/swagger", swaggerUi.serve, swaggerUi.setup(spec));
}

