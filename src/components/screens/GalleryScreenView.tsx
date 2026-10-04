import { useEffect, useState } from 'react';
import { ArrowLeft, Image as ImageIcon, Plus, Trash2 } from 'lucide-react';
import { ScreenType } from '../../types';

interface GalleryItem {
  id: string;
  src: string;
  title: string;
  date: string;
}

const KEY = 'phone:gallery';

export function GalleryScreenView({ onNavigate }: { themeMode?: any; onNavigate: (screen: ScreenType) => void }) {
  const [photos, setPhotos] = useState<GalleryItem[]>([]);

  useEffect(() => {
    try {
      setPhotos(JSON.parse(localStorage.getItem(KEY) || '[]') as GalleryItem[]);
    } catch {
      setPhotos([]);
    }
  }, []);

  const importPhoto = (file?: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const next: GalleryItem[] = [{
        id: `photo-${Date.now()}`,
        src: String(reader.result || ''),
        title: file.name,
        date: new Date().toISOString().slice(0, 10),
      }, ...photos];
      setPhotos(next);
      localStorage.setItem(KEY, JSON.stringify(next));
    };
    reader.readAsDataURL(file);
  };

  const remove = (id: string) => {
    const next = photos.filter(item => item.id !== id);
    setPhotos(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden" style={{ background: 'var(--screen, #fff)', color: 'var(--ink, #242323)' }}>
      <div className="px-5 pt-12 pb-3.5 border-b border-[#ddd6cd] bg-white/90 backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('home')} className="w-8 h-8 rounded-full bg-neutral-100 border border-neutral-200 grid place-items-center"><ArrowLeft className="w-4 h-4" /></button>
          <div><div className="text-[8px] font-mono tracking-[2px] text-[#817a72]">GALLERY</div><h2 className="font-serif font-bold text-[16px]">相册</h2></div>
        </div>
        <label className="h-8 px-3 rounded-full bg-[#292724] text-white text-[10px] flex items-center gap-1.5 cursor-pointer">
          <Plus className="w-3.5 h-3.5" /> 添加
          <input type="file" accept="image/*" className="hidden" onChange={e => importPhoto(e.target.files?.[0])} />
        </label>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto p-4 no-scrollbar">
        {photos.length === 0 ? (
          <div className="h-full min-h-[520px] flex items-center justify-center">
            <div className="w-full rounded-[24px] border border-dashed border-[#d4cbbf] bg-[#f7f3ec]/70 p-6 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-white border border-[#e2ddd5] grid place-items-center text-[#8b7560]"><ImageIcon className="w-6 h-6 stroke-[1.4]" /></div>
              <div className="mt-4 font-serif font-bold text-[17px]">相册还是空的</div>
              <div className="mt-2 text-[10px] leading-relaxed text-[#8b8782]">没有任何预置照片。<br />点击右上角“添加”从本机导入。</div>
              <label className="mt-5 inline-flex h-10 px-5 rounded-full bg-[#292724] text-white text-[11px] items-center gap-2 cursor-pointer">
                <Plus className="w-3.5 h-3.5" /> 导入照片
                <input type="file" accept="image/*" className="hidden" onChange={e => importPhoto(e.target.files?.[0])} />
              </label>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {photos.map(photo => (
              <div key={photo.id} className="rounded-[18px] bg-white/80 border border-[#e0dad2] overflow-hidden">
                <div className="aspect-square overflow-hidden bg-[#eee9e1]">
                  <img src={photo.src} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="p-2.5">
                  <div className="text-[10px] font-semibold truncate">{photo.title}</div>
                  <div className="mt-1 flex items-center justify-between text-[8px] font-mono text-[#8b8782]"><span>{photo.date}</span><button onClick={() => remove(photo.id)}><Trash2 className="w-3 h-3 text-[#9b625b]" /></button></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
