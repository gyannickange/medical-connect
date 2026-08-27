import { S3Service } from "./s3.service";

const sendMock = jest.fn().mockResolvedValue({});
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
}));
jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn().mockResolvedValue("https://signed.example/photo.jpg"),
}));

describe("S3Service", () => {
  beforeEach(() => {
    process.env.AWS_REGION = "eu-west-1";
    process.env.AWS_S3_BUCKET_PATIENT_PHOTOS = "medical-connect-photos";
    sendMock.mockClear();
  });

  it("uploads an object with the given key, body, and content type", async () => {
    const service = new S3Service();
    await service.uploadObject("tenants/t1/patients/p1/photo-1.jpg", Buffer.from("data"), "image/jpeg");

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: "medical-connect-photos",
          Key: "tenants/t1/patients/p1/photo-1.jpg",
          ContentType: "image/jpeg",
        }),
      })
    );
  });

  it("returns a presigned URL for a given key", async () => {
    const service = new S3Service();
    const url = await service.getPresignedUrl("tenants/t1/patients/p1/photo-1.jpg", 300);
    expect(url).toBe("https://signed.example/photo.jpg");
  });
});
