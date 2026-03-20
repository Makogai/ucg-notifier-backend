import { SubscriptionType, type Subscription } from "@prisma/client";
import { prisma } from "../prisma/client";
import { UserService } from "./UserService";

export type SubscribeInput = {
  deviceId: string;
  fcmToken: string;
  type: SubscriptionType;
  referenceId: number;
  // PROGRAM only: semester=0 means whole program
  semester?: number;
};

export class SubscriptionService {
  constructor(private userService = new UserService()) {}

  async subscribe(input: SubscribeInput): Promise<Subscription> {
    const user = await this.userService.getOrCreateByDeviceId(
      input.deviceId,
      input.fcmToken,
    );

    const semester = input.type === "PROGRAM" ? input.semester ?? 0 : 0;

    return prisma.subscription.upsert({
      where: {
        userId_type_referenceId_semester: {
          userId: user.id,
          type: input.type,
          referenceId: input.referenceId,
          semester,
        },
      },
      update: {},
      create: {
        userId: user.id,
        type: input.type,
        referenceId: input.referenceId,
        semester,
      },
    });
  }

  async listByDeviceId(deviceId: string) {
    const user = await prisma.user.findUnique({ where: { deviceId } });
    if (!user) return [];

    const subs = await prisma.subscription.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const facultyIds = subs
      .filter((s) => s.type === "FACULTY")
      .map((s) => s.referenceId);
    const programIds = subs
      .filter((s) => s.type === "PROGRAM")
      .map((s) => s.referenceId);
    const subjectIds = subs
      .filter((s) => s.type === "SUBJECT")
      .map((s) => s.referenceId);

    const [faculties, programs, subjects] = await Promise.all([
      facultyIds.length
        ? prisma.faculty.findMany({
            where: { id: { in: facultyIds } },
            select: { id: true, name: true, shortCode: true },
          })
        : [],
      programIds.length
        ? prisma.program.findMany({
            where: { id: { in: programIds } },
            select: { id: true, name: true, type: true, facultyId: true },
          })
        : [],
      subjectIds.length
        ? prisma.subject.findMany({
            where: { id: { in: subjectIds } },
            select: {
              id: true,
              name: true,
              code: true,
              semester: true,
              ects: true,
              programId: true,
            },
          })
        : [],
    ]);

    const facultyById = new Map(faculties.map((f) => [f.id, f]));
    const programById = new Map(programs.map((p) => [p.id, p]));
    const subjectById = new Map(subjects.map((s) => [s.id, s]));

    return subs.map((s) => {
      // Flutter-friendly shape: always return the resolved object under
      // the key that matches the subscription type.
      const base = {
        id: s.id,
        type: s.type,
        referenceId: s.referenceId,
        semester: s.semester,
      };

      if (s.type === "FACULTY") {
        return {
          ...base,
          faculty: facultyById.get(s.referenceId) ?? null,
          program: null,
          subject: null,
        };
      }

      if (s.type === "PROGRAM") {
        return {
          ...base,
          faculty: null,
          program: programById.get(s.referenceId) ?? null,
          subject: null,
        };
      }

      return {
        ...base,
        faculty: null,
        program: null,
        subject: subjectById.get(s.referenceId) ?? null,
      };
    });
  }

  async unsubscribe(input: {
    deviceId: string;
    type: SubscriptionType;
    referenceId: number;
    semester?: number;
  }) {
    const user = await prisma.user.findUnique({
      where: { deviceId: input.deviceId },
      select: { id: true },
    });
    if (!user) return { deleted: 0 };

    const semester = input.type === "PROGRAM" ? input.semester ?? 0 : 0;

    const result = await prisma.subscription.deleteMany({
      where: {
        userId: user.id,
        type: input.type,
        referenceId: input.referenceId,
        semester,
      },
    });

    return { deleted: result.count };
  }

  async deleteById(id: number) {
    const result = await prisma.subscription.deleteMany({
      where: { id },
    });

    return { deleted: result.count };
  }
}

