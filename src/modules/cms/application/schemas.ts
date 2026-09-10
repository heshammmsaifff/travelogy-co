import { z } from "zod";

export const featureItemSchema = z.object({
  key: z.string().min(1),
  titleAr: z.string().min(2),
  titleEn: z.string().min(2),
  bodyAr: z.string().min(2),
  bodyEn: z.string().min(2),
});

export type FeatureItem = z.infer<typeof featureItemSchema>;

export const stepItemSchema = z.object({
  step: z.string().min(1),
  titleAr: z.string().min(2),
  titleEn: z.string().min(2),
  bodyAr: z.string().min(2),
  bodyEn: z.string().min(2),
});

export type StepItem = z.infer<typeof stepItemSchema>;

export const saveHomepageContentSchema = z.object({
  heroEyebrowAr: z.string().min(2),
  heroEyebrowEn: z.string().min(2),
  heroTitleAr: z.string().min(2),
  heroTitleEn: z.string().min(2),
  heroSubtitleAr: z.string().min(2),
  heroSubtitleEn: z.string().min(2),

  featuresTitleAr: z.string().min(2),
  featuresTitleEn: z.string().min(2),
  featuresSubtitleAr: z.string().min(2),
  featuresSubtitleEn: z.string().min(2),
  features: z.array(featureItemSchema),

  howTitleAr: z.string().min(2),
  howTitleEn: z.string().min(2),
  howSteps: z.array(stepItemSchema),

  ctaTitleAr: z.string().min(2),
  ctaTitleEn: z.string().min(2),
  ctaBodyAr: z.string().min(2),
  ctaBodyEn: z.string().min(2),
  ctaButtonAr: z.string().min(2),
  ctaButtonEn: z.string().min(2),
});

export type SaveHomepageContentInput = z.infer<typeof saveHomepageContentSchema>;
