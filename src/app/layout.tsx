import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';

const title = '숲속여행 · 조용한 숲 산책';
const description =
  '여러 사람이 함께 걷는 1인칭 힐링 숲. 산길을 걷고, 빈터의 모닥불 옆에서 이야기를 나누고, 2층 오두막의 벽난로 곁에서 쉬어 가세요.';

export const metadata: Metadata = {
  title: {
    default: title,
    template: '%s · 숲속여행',
  },
  description,
  applicationName: '숲속여행',
  keywords: ['숲', '힐링', '산책', '멀티플레이어', '3D', '오두막', '명상'],
  openGraph: {
    title,
    description,
    type: 'website',
    locale: 'ko_KR',
    siteName: '숲속여행',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#141d18',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
